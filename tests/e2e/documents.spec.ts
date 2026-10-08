import { createHash, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { DOCUMENTS_BUCKET } from "@/lib/documents/files";
import { DocumentStoreError, storeDocumentVersion } from "@/lib/documents/store";
import { type Database } from "@/lib/supabase/database.types";

import { deleteOrganization } from "./support/users";

/**
 * The document store (E1.5.4) against the real database and storage. No browser: the
 * upload screens come in E2. This drives the same core the server helper uses, with
 * the service-role client the helper passes; permission checks are covered by unit
 * tests (matrix) and verify:rls (database and storage policies).
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env.local.`);
  return value;
}

const db = createClient<Database>(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SECRET_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const pdf = (label: string) =>
  new TextEncoder().encode(`%PDF-1.4\n% synthetic test document ${label} ${randomUUID()}\n%%EOF\n`);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function createCompany(): Promise<string> {
  const { data, error } = await db
    .from("organizations")
    .insert({ name: `E2E Documents ${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  if (error) throw new Error(`organization insert failed: ${error.message}`);
  return data.id;
}

/** Storage objects are not tied to rows, so they are removed before the company. */
async function deleteCompanyAndFiles(organizationId: string): Promise<void> {
  const bucket = db.storage.from(DOCUMENTS_BUCKET);
  const folders = await bucket.list(organizationId);
  for (const folder of folders.data ?? []) {
    const files = await bucket.list(`${organizationId}/${folder.name}`);
    const paths = (files.data ?? []).map((f) => `${organizationId}/${folder.name}/${f.name}`);
    if (paths.length > 0) await bucket.remove(paths);
  }
  await deleteOrganization(organizationId);
}

test.describe("document store", () => {
  const companies: string[] = [];
  test.afterEach(async () => {
    for (const id of companies.splice(0)) await deleteCompanyAndFiles(id);
  });

  test("stores a new document as version 1 and a renewal as version 2, keeping version 1", async () => {
    const organizationId = await createCompany();
    companies.push(organizationId);
    const actor = { organizationId, userId: randomUUID() };
    const first = pdf("first");

    const v1 = await storeDocumentVersion(db, actor, {
      target: { type: "new", document: { kind: "company", title: "CSD report", category: "csd" } },
      file: { name: "csd-report.pdf", bytes: first },
    });
    if (v1.status !== "stored") throw new Error(`expected stored, got ${v1.status}`);
    expect(v1.version).toMatchObject({
      versionNumber: 1,
      sha256: sha256(first),
      sizeBytes: first.byteLength,
      mimeType: "application/pdf",
      storagePath: `${organizationId}/${v1.version.documentId}/${v1.version.versionId}`,
    });

    const stored = await db.storage.from(DOCUMENTS_BUCKET).download(v1.version.storagePath);
    expect(stored.error).toBeNull();
    const storedBytes = new Uint8Array((await stored.data?.arrayBuffer()) ?? new ArrayBuffer(0));
    expect(sha256(storedBytes)).toBe(sha256(first));

    const renewed = pdf("renewed");
    const v2 = await storeDocumentVersion(db, actor, {
      target: { type: "existing", documentId: v1.version.documentId },
      file: { name: "csd-report-2026.pdf", bytes: renewed },
    });
    if (v2.status !== "stored") throw new Error(`expected stored, got ${v2.status}`);
    expect(v2.version.versionNumber).toBe(2);
    expect(v2.version.documentId).toBe(v1.version.documentId);

    const document = await db
      .from("documents")
      .select("title, kind, category, current_version_id, created_by")
      .eq("id", v1.version.documentId)
      .single();
    expect(document.data).toEqual({
      title: "CSD report",
      kind: "company",
      category: "csd",
      current_version_id: v2.version.versionId,
      created_by: actor.userId,
    });
    const versions = await db
      .from("document_versions")
      .select("version_number, sha256, original_file_name, uploaded_by")
      .eq("document_id", v1.version.documentId)
      .order("version_number");
    expect(versions.data).toEqual([
      {
        version_number: 1,
        sha256: sha256(first),
        original_file_name: "csd-report.pdf",
        uploaded_by: actor.userId,
      },
      {
        version_number: 2,
        sha256: sha256(renewed),
        original_file_name: "csd-report-2026.pdf",
        uploaded_by: actor.userId,
      },
    ]);
  });

  test("reports the same bytes again in the same company as a duplicate and stores nothing", async () => {
    const organizationId = await createCompany();
    const otherCompany = await createCompany();
    companies.push(organizationId, otherCompany);
    const actor = { organizationId, userId: randomUUID() };
    const bytes = pdf("tax clearance");

    const original = await storeDocumentVersion(db, actor, {
      target: { type: "new", document: { kind: "company", title: "Tax compliance PIN" } },
      file: { name: "tax.pdf", bytes },
    });
    if (original.status !== "stored") throw new Error("original not stored");

    const again = await storeDocumentVersion(db, actor, {
      target: { type: "new", document: { kind: "company", title: "Tax PIN (again)" } },
      file: { name: "tax-copy.pdf", bytes },
    });
    expect(again).toEqual({
      status: "duplicate",
      existing: {
        documentId: original.version.documentId,
        versionId: original.version.versionId,
        versionNumber: 1,
        title: "Tax compliance PIN",
      },
    });
    const documents = await db.from("documents").select("id").eq("organization_id", organizationId);
    expect(documents.data).toHaveLength(1);
    const folders = await db.storage.from(DOCUMENTS_BUCKET).list(organizationId);
    expect(folders.data).toHaveLength(1);

    // Duplicates are per company: another company storing the same file is not one.
    const elsewhere = await storeDocumentVersion(
      db,
      { organizationId: otherCompany, userId: randomUUID() },
      {
        target: { type: "new", document: { kind: "company", title: "Tax compliance PIN" } },
        file: { name: "tax.pdf", bytes },
      },
    );
    expect(elsewhere.status).toBe("stored");
  });

  test("refuses files that are not a PDF or image, whatever they are called", async () => {
    const organizationId = await createCompany();
    companies.push(organizationId);
    const attempt = storeDocumentVersion(
      db,
      { organizationId, userId: randomUUID() },
      {
        target: { type: "new", document: { kind: "company", title: "Not a PDF" } },
        file: { name: "renamed.pdf", bytes: new TextEncoder().encode("<html>not a pdf</html>") },
      },
    );
    await expect(attempt).rejects.toThrow(DocumentStoreError);
    await expect(attempt).rejects.toMatchObject({ code: "invalid_file" });
    const documents = await db.from("documents").select("id").eq("organization_id", organizationId);
    expect(documents.data).toHaveLength(0);
  });

  test("adds no version to an archived document, or to another company's document", async () => {
    const organizationId = await createCompany();
    const otherCompany = await createCompany();
    companies.push(organizationId, otherCompany);
    const actor = { organizationId, userId: randomUUID() };

    const stored = await storeDocumentVersion(db, actor, {
      target: { type: "new", document: { kind: "company", title: "B-BBEE affidavit" } },
      file: { name: "bbbee.pdf", bytes: pdf("bbbee") },
    });
    if (stored.status !== "stored") throw new Error("not stored");
    const theirs = await storeDocumentVersion(
      db,
      { organizationId: otherCompany, userId: randomUUID() },
      {
        target: { type: "new", document: { kind: "company", title: "Their CIPC" } },
        file: { name: "cipc.pdf", bytes: pdf("cipc") },
      },
    );
    if (theirs.status !== "stored") throw new Error("not stored");

    const archived = await db
      .from("documents")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", stored.version.documentId);
    expect(archived.error).toBeNull();

    await expect(
      storeDocumentVersion(db, actor, {
        target: { type: "existing", documentId: stored.version.documentId },
        file: { name: "bbbee-2.pdf", bytes: pdf("bbbee renewed") },
      }),
    ).rejects.toMatchObject({ code: "archived" });

    await expect(
      storeDocumentVersion(db, actor, {
        target: { type: "existing", documentId: theirs.version.documentId },
        file: { name: "hijack.pdf", bytes: pdf("hijack") },
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    const versions = await db
      .from("document_versions")
      .select("document_id")
      .in("document_id", [stored.version.documentId, theirs.version.documentId]);
    expect(versions.data).toHaveLength(2);
    const files = await db.storage
      .from(DOCUMENTS_BUCKET)
      .list(`${organizationId}/${theirs.version.documentId}`);
    expect(files.data ?? []).toHaveLength(0);
  });

  test("two simultaneous uploads of the same file store it once", async () => {
    const organizationId = await createCompany();
    companies.push(organizationId);
    const bytes = pdf("cidb certificate");
    const upload = (title: string) =>
      storeDocumentVersion(
        db,
        { organizationId, userId: randomUUID() },
        {
          target: { type: "new", document: { kind: "company", title } },
          file: { name: "cidb.pdf", bytes },
        },
      );

    const results = await Promise.all([upload("CIDB (tab one)"), upload("CIDB (tab two)")]);
    expect(results.map((r) => r.status).toSorted()).toEqual(["duplicate", "stored"]);
    const versions = await db
      .from("document_versions")
      .select("id")
      .eq("organization_id", organizationId);
    expect(versions.data).toHaveLength(1);
    // The losing upload's file was removed, so only one folder holds a file.
    const folders = await db.storage.from(DOCUMENTS_BUCKET).list(organizationId);
    let files = 0;
    for (const folder of folders.data ?? []) {
      const inside = await db.storage
        .from(DOCUMENTS_BUCKET)
        .list(`${organizationId}/${folder.name}`);
      files += inside.data?.length ?? 0;
    }
    expect(files).toBe(1);
  });

  test("an archived document does not block storing the same file again", async () => {
    const organizationId = await createCompany();
    companies.push(organizationId);
    const actor = { organizationId, userId: randomUUID() };
    const bytes = pdf("municipal account");
    const first = await storeDocumentVersion(db, actor, {
      target: { type: "new", document: { kind: "company", title: "Municipal account" } },
      file: { name: "rates.pdf", bytes },
    });
    if (first.status !== "stored") throw new Error("not stored");
    await db
      .from("documents")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", first.version.documentId);

    // To the archived document itself: refused as archived, not reported as a duplicate.
    await expect(
      storeDocumentVersion(db, actor, {
        target: { type: "existing", documentId: first.version.documentId },
        file: { name: "rates.pdf", bytes },
      }),
    ).rejects.toMatchObject({ code: "archived" });

    const again = await storeDocumentVersion(db, actor, {
      target: { type: "new", document: { kind: "company", title: "Municipal account (current)" } },
      file: { name: "rates.pdf", bytes },
    });
    expect(again.status).toBe("stored");
  });

  test("every stored version has its audit entry and domain event, written with it", async () => {
    const organizationId = await createCompany();
    companies.push(organizationId);
    const actor = { organizationId, userId: randomUUID() };
    const stored = await storeDocumentVersion(db, actor, {
      target: { type: "new", document: { kind: "company", title: "ID copy" } },
      file: { name: "Thabo 8001015009087 ID.pdf", bytes: pdf("id copy") },
    });
    if (stored.status !== "stored") throw new Error("not stored");

    const events = await db
      .from("audit_events")
      .select("organization_id, actor_id, action, entity_type, entity_id, details")
      .eq("organization_id", organizationId);
    expect(events.data).toEqual([
      {
        organization_id: organizationId,
        actor_id: actor.userId,
        action: "document.uploaded",
        entity_type: "document",
        entity_id: stored.version.documentId,
        details: {
          versionId: stored.version.versionId,
          versionNumber: 1,
          sha256: stored.version.sha256,
          sizeBytes: stored.version.sizeBytes,
          mimeType: "application/pdf",
        },
      },
    ]);
    // The file name can carry an ID number, so it is never in the audit log.
    expect(JSON.stringify(events.data)).not.toContain("8001015009087");

    // The same transaction records the domain event (E1.5.5).
    const domainEvents = await db
      .from("domain_events")
      .select("type, entity_type, entity_id, actor_id")
      .eq("organization_id", organizationId);
    expect(domainEvents.data).toEqual([
      {
        type: "document.uploaded",
        entity_type: "document",
        entity_id: stored.version.documentId,
        actor_id: actor.userId,
      },
    ]);
  });
});

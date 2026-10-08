/**
 * RLS verification (T1.3, extended per ticket: E1.4 onboarding, E1.5 audit log,
 * E1.5.2 memberships, E1.5.3 viewer, E1.5.4 documents and file storage).
 *
 * `tsc` cannot test SQL, so tenant isolation has to be proven against a real
 * database. This script provisions two organizations with one user each, then
 * asserts — as those users, over the wire, through PostgREST — that neither can
 * see or touch the other's data, and that neither can escalate their own role.
 *
 * It deliberately does NOT import from `src/lib/supabase/*`: the subject under
 * test is the database's policies, not the app's client wrappers.
 *
 * Run with:  npm run verify:rls
 * Fixtures are always torn down, including on failure.
 */
import { createHash, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    console.error(`Missing ${name}. Run via \`npm run verify:rls\` so .env.local is loaded.`);
    process.exit(1);
  }
  return value;
}

const URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const PUBLISHABLE = requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const SECRET = requireEnv("SUPABASE_SECRET_KEY");

const admin = createClient(URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Fresh suffix so repeated runs never collide on the unique email index. */
const RUN = Date.now().toString(36);
const PASSWORD = `Test-${RUN}-Aa1!`;

let checks = 0;
let failures = 0;
/** Teardown problems: not an isolation failure, but the run must still not pass. */
let cleanupFailures = 0;

function check(label: string, passed: boolean, detail?: string): void {
  checks += 1;
  if (passed) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A client authenticated as a specific user, using the browser-safe key. */
async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

type Role = "bid_manager" | "pricing_specialist" | "executive_approver" | "viewer";

async function main(): Promise<void> {
  const created = {
    userIds: [] as string[],
    orgIds: [] as string[],
    storagePaths: [] as string[],
  };

  /**
   * A confirmed person with a profile and an active membership in each company
   * listed, in order (the first is their selected company). Memberships are
   * inserted one by one so their join dates differ.
   */
  async function createPerson(email: string, memberships: [string, Role][]): Promise<string> {
    const [first] = memberships;
    if (first === undefined) throw new Error("a person needs at least one membership");
    const u = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (u.error || !u.data.user) throw new Error(`createUser failed: ${u.error?.message}`);
    const id = u.data.user.id;
    created.userIds.push(id);

    const p = await admin
      .from("profiles")
      .insert({ id, full_name: email, active_organization_id: first[0] });
    if (p.error) throw new Error(`profile insert failed: ${p.error.message}`);
    for (const [organizationId, role] of memberships) {
      const m = await admin
        .from("memberships")
        .insert({ organization_id: organizationId, user_id: id, role });
      if (m.error) throw new Error(`membership insert failed: ${m.error.message}`);
    }
    return id;
  }

  try {
    // ---- Fixtures (service_role; bypasses RLS by design) -------------------
    const orgs = await admin
      .from("organizations")
      .insert([{ name: `Alpha Bidders ${RUN}` }, { name: `Beta Contractors ${RUN}` }])
      .select("id, name");
    if (orgs.error) throw new Error(`org insert failed: ${orgs.error.message}`);

    const orgA = orgs.data[0];
    const orgB = orgs.data[1];
    if (!orgA || !orgB) throw new Error("expected two organizations");
    created.orgIds.push(orgA.id, orgB.id);

    const emailA = `rls-a-${RUN}@example.com`;
    const emailB = `rls-b-${RUN}@example.com`;

    const userA = await createPerson(emailA, [[orgA.id, "bid_manager"]]);
    const userB = await createPerson(emailB, [[orgB.id, "pricing_specialist"]]);

    console.log(`\nFixtures: org A=${orgA.id.slice(0, 8)} org B=${orgB.id.slice(0, 8)}\n`);

    // ---- Tenant isolation, as user A (bid_manager in org A) ----------------
    console.log("Tenant isolation — user A (bid_manager, org A):");
    const a = await signIn(emailA);

    const aOrgs = await a.from("organizations").select("id, name");
    check(
      "sees exactly one organization (its own)",
      !aOrgs.error && aOrgs.data?.length === 1 && aOrgs.data[0]?.id === orgA.id,
      aOrgs.error?.message ?? `got ${aOrgs.data?.length} rows`,
    );

    const aOrgB = await a.from("organizations").select("id").eq("id", orgB.id);
    check(
      "cannot read the other tenant's organization by id",
      !aOrgB.error && aOrgB.data?.length === 0,
      aOrgB.error?.message ?? `got ${aOrgB.data?.length} rows`,
    );

    const aProfiles = await a.from("profiles").select("id");
    check(
      "sees only profiles within its own organization",
      !aProfiles.error && aProfiles.data?.length === 1 && aProfiles.data[0]?.id === userA,
      aProfiles.error?.message ?? `got ${aProfiles.data?.length} rows`,
    );

    // ---- Privilege escalation attempts -------------------------------------
    console.log("\nPrivilege escalation — user A:");
    const selfName = await a.from("profiles").update({ full_name: "Renamed" }).eq("id", userA);
    check("may update its own full_name", !selfName.error, selfName.error?.message);

    // Role and company live on the membership (E1.5.2); users hold no UPDATE on it.
    const selfRole = await a
      .from("memberships")
      .update({ role: "executive_approver" })
      .eq("user_id", userA);
    check(
      "CANNOT promote itself to executive_approver",
      selfRole.error?.code === "42501",
      selfRole.error ? `blocked: ${selfRole.error.code}` : "UPDATE SUCCEEDED — CRITICAL",
    );

    const selfOrg = await a
      .from("memberships")
      .update({ organization_id: orgB.id })
      .eq("user_id", userA);
    check(
      "CANNOT move its membership into the other organization",
      selfOrg.error?.code === "42501",
      selfOrg.error ? `blocked: ${selfOrg.error.code}` : "UPDATE SUCCEEDED — CRITICAL",
    );

    const newOrg = await a.from("organizations").insert({ name: "Rogue Org" });
    check(
      "CANNOT create an organization",
      newOrg.error !== null,
      newOrg.error ? `blocked: ${newOrg.error.code}` : "INSERT SUCCEEDED — CRITICAL",
    );

    const otherOrgUpdate = await a
      .from("organizations")
      .update({ name: "Hijacked" })
      .eq("id", orgB.id)
      .select("id");
    check(
      "CANNOT rename the other tenant's organization",
      otherOrgUpdate.error !== null || otherOrgUpdate.data?.length === 0,
      `affected ${otherOrgUpdate.data?.length ?? 0} rows`,
    );

    // ---- Role-based write access on organizations --------------------------
    console.log("\nRBAC on organizations:");
    const aOwnOrgUpdate = await a
      .from("organizations")
      .update({ name: `Alpha Bidders ${RUN} (edited)` })
      .eq("id", orgA.id)
      .select("id");
    check(
      "bid_manager MAY update its own organization",
      !aOwnOrgUpdate.error && aOwnOrgUpdate.data?.length === 1,
      aOwnOrgUpdate.error?.message ?? `affected ${aOwnOrgUpdate.data?.length} rows`,
    );

    const b = await signIn(emailB);
    const bOwnOrgUpdate = await b
      .from("organizations")
      .update({ name: "Beta renamed by specialist" })
      .eq("id", orgB.id)
      .select("id");
    check(
      "pricing_specialist may NOT update its own organization",
      bOwnOrgUpdate.error !== null || bOwnOrgUpdate.data?.length === 0,
      `affected ${bOwnOrgUpdate.data?.length ?? 0} rows`,
    );

    // E1.5.3: the read-only viewer reads its company like any member, and the database
    // refuses its writes even if the app's permission check had a bug.
    const emailV = `rls-v-${RUN}@example.com`;
    await createPerson(emailV, [[orgA.id, "viewer"]]);
    const v = await signIn(emailV);
    const vOrgs = await v.from("organizations").select("id");
    const vEvents = await v.from("audit_events").select("organization_id");
    check(
      "viewer reads its own company, and only its company's audit events",
      !vOrgs.error &&
        vOrgs.data.length === 1 &&
        vOrgs.data[0]?.id === orgA.id &&
        !vEvents.error &&
        vEvents.data.every((e) => e.organization_id === orgA.id),
      vOrgs.error?.message ?? `got ${vOrgs.data?.length} rows`,
    );
    const vUpdate = await v
      .from("organizations")
      .update({ name: `Alpha renamed by viewer ${RUN}` })
      .eq("id", orgA.id)
      .select("id");
    check(
      "viewer may NOT update its own organization",
      vUpdate.error !== null || vUpdate.data?.length === 0,
      `affected ${vUpdate.data?.length ?? 0} rows`,
    );

    // ---- Onboarding (E1.4) ---------------------------------------------------
    console.log("\nOnboarding — complete_onboarding():");

    /** A confirmed user with NO profile, i.e. someone who has just signed up. */
    async function createNewcomer(label: string): Promise<string> {
      const email = `rls-${label}-${RUN}@example.com`;
      const u = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (u.error || !u.data.user) throw new Error(`createUser failed: ${u.error?.message}`);
      created.userIds.push(u.data.user.id);
      return email;
    }

    async function orgsNamed(name: string): Promise<number> {
      const r = await admin.from("organizations").select("id").eq("name", name);
      if (r.error) throw new Error(`org lookup failed: ${r.error.message}`);
      return r.data.length;
    }

    const aAgain = await a.rpc("complete_onboarding", {
      company_name: `Alpha Second ${RUN}`,
      full_name: "A again",
    });
    check(
      "a user who already has a profile CANNOT onboard again",
      aAgain.error !== null && (await orgsNamed(`Alpha Second ${RUN}`)) === 0,
      aAgain.error ? `blocked: ${aAgain.error.code}` : "SECOND WORKSPACE CREATED — CRITICAL",
    );

    const c = await signIn(await createNewcomer("c"));
    const cBefore = await c.from("organizations").select("id");
    check(
      "a newcomer without a profile sees no organizations (fails closed)",
      !cBefore.error && cBefore.data?.length === 0,
      cBefore.error?.message ?? `got ${cBefore.data?.length} rows`,
    );

    const cOnboard = await c.rpc("complete_onboarding", {
      company_name: `  Gamma Supplies ${RUN}  `,
      full_name: "Casey",
    });
    if (typeof cOnboard.data === "string") created.orgIds.push(cOnboard.data);
    const cOrgs = await c.from("organizations").select("id, name");
    const cMemberships = await c.from("memberships").select("organization_id, role, status");
    check(
      "a newcomer creates exactly one workspace with an active executive_approver membership",
      !cOnboard.error &&
        cOrgs.data?.length === 1 &&
        cOrgs.data[0]?.id === cOnboard.data &&
        cOrgs.data[0]?.name === `Gamma Supplies ${RUN}` &&
        cMemberships.data?.length === 1 &&
        cMemberships.data[0]?.organization_id === cOnboard.data &&
        cMemberships.data[0]?.role === "executive_approver" &&
        cMemberships.data[0]?.status === "active",
      cOnboard.error?.message ??
        `orgs=${cOrgs.data?.length} memberships=${cMemberships.data?.length}`,
    );

    const cAgain = await c.rpc("complete_onboarding", {
      company_name: `Gamma Second ${RUN}`,
      full_name: "Casey",
    });
    const cOrgsAfter = await c.from("organizations").select("id");
    check(
      "the same user CANNOT create a second workspace",
      cAgain.error !== null &&
        (await orgsNamed(`Gamma Second ${RUN}`)) === 0 &&
        cOrgsAfter.data?.length === 1,
      cAgain.error ? `blocked: ${cAgain.error.code}` : "SECOND WORKSPACE CREATED — CRITICAL",
    );

    const cId = (await c.auth.getUser()).data.user?.id ?? "";
    const cJoin = await c
      .from("memberships")
      .update({ organization_id: orgA.id })
      .eq("user_id", cId);
    const cSwitch = await c.rpc("switch_organization", { organization_id: orgA.id });
    const cSeesA = await c.from("organizations").select("id").eq("id", orgA.id);
    check(
      "an onboarded user CANNOT move into another company afterwards",
      cJoin.error?.code === "42501" && cSwitch.error !== null && cSeesA.data?.length === 0,
      `membership: ${cJoin.error?.code ?? "MOVED — CRITICAL"}; switch: ${cSwitch.error?.code ?? "SWITCHED — CRITICAL"}`,
    );

    const d = await signIn(await createNewcomer("d"));
    // Spaces, and whitespace Postgres `trim()` alone would not strip (tabs, newlines).
    const blanks = await Promise.all(
      ["   ", "\t\n", "\r\n\t "].map((blank) =>
        d.rpc("complete_onboarding", { company_name: blank, full_name: "Dana" }),
      ),
    );
    const blankName = await d.rpc("complete_onboarding", {
      company_name: `Delta Named ${RUN}`,
      full_name: "\t\n",
    });
    const dProfile = await d.from("profiles").select("id");
    check(
      "blank company or person names (any whitespace) are refused and leave nothing behind",
      blanks.every((r) => r.error !== null) &&
        blankName.error !== null &&
        dProfile.data?.length === 0 &&
        (await orgsNamed(`Delta Named ${RUN}`)) === 0,
      blanks.map((r) => r.error?.code ?? "CREATED").join(",") + ` / ${blankName.error?.code}`,
    );

    const dPrivate = await d
      .schema("private")
      .rpc("create_workspace", { company_name: `Delta ${RUN}`, full_name: "Dana" });
    const dDirect = await fetch(`${URL}/rest/v1/rpc/create_workspace`, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE,
        Authorization: `Bearer ${(await d.auth.getSession()).data.session?.access_token ?? ""}`,
        "Content-Type": "application/json",
        "Content-Profile": "private",
      },
      body: JSON.stringify({ company_name: `Delta ${RUN}`, full_name: "Dana" }),
    });
    check(
      "the SECURITY DEFINER function is not reachable through the API",
      dPrivate.error !== null && !dDirect.ok && (await orgsNamed(`Delta ${RUN}`)) === 0,
      `schema('private'): ${dPrivate.error?.code ?? "ok"}; direct: HTTP ${dDirect.status}`,
    );

    // ---- Audit log (E1.5) ---------------------------------------------------
    console.log("\nAudit log — audit_events:");
    const seeded = await admin
      .from("audit_events")
      .insert([
        {
          organization_id: orgA.id,
          actor_id: userA,
          action: "workspace.created",
          entity_type: "organization",
          entity_id: orgA.id,
        },
        {
          organization_id: orgB.id,
          action: "workspace.created",
          entity_type: "organization",
          entity_id: orgB.id,
        },
      ])
      .select("id, organization_id");
    if (seeded.error) throw new Error(`audit seed failed: ${seeded.error.message}`);
    const eventA = seeded.data.find((e) => e.organization_id === orgA.id)?.id;
    const eventB = seeded.data.find((e) => e.organization_id === orgB.id)?.id;
    if (eventA === undefined || eventB === undefined) throw new Error("audit seed incomplete");

    const aEvents = await a.from("audit_events").select("id, organization_id");
    check(
      "a member reads its own organization's events only",
      !aEvents.error &&
        aEvents.data.some((e) => e.id === eventA) &&
        aEvents.data.every((e) => e.organization_id === orgA.id),
      aEvents.error?.message ?? `got ${aEvents.data?.length} rows`,
    );

    const aReadsB = await a.from("audit_events").select("id").eq("id", eventB);
    check(
      "a member CANNOT read another company's events",
      !aReadsB.error && aReadsB.data.length === 0,
      aReadsB.error?.message ?? `got ${aReadsB.data?.length} rows`,
    );

    const aInsert = await a.from("audit_events").insert({
      organization_id: orgA.id,
      actor_id: userA,
      action: "workspace.created",
      entity_type: "organization",
    });
    check(
      "a member CANNOT write an event directly (no forged entries)",
      aInsert.error !== null,
      aInsert.error ? `blocked: ${aInsert.error.code}` : "INSERT SUCCEEDED — CRITICAL",
    );

    const aUpdate = await a
      .from("audit_events")
      .update({ action: "workspace.renamed" })
      .eq("id", eventA)
      .select("id");
    const aDelete = await a.from("audit_events").delete().eq("id", eventA).select("id");
    check(
      "a member CANNOT update or delete its own organization's events",
      (aUpdate.error !== null || aUpdate.data?.length === 0) &&
        (aDelete.error !== null || aDelete.data?.length === 0),
      `update: ${aUpdate.error?.code ?? aUpdate.data?.length}; delete: ${aDelete.error?.code ?? aDelete.data?.length}`,
    );

    const svcUpdate = await admin
      .from("audit_events")
      .update({ action: "workspace.renamed" })
      .eq("id", eventA)
      .select("id");
    const svcDelete = await admin.from("audit_events").delete().eq("id", eventA).select("id");
    const stillThere = await admin.from("audit_events").select("action").eq("id", eventA).single();
    check(
      "even the service role CANNOT update or delete an event",
      svcUpdate.error !== null &&
        svcDelete.error !== null &&
        stillThere.data?.action === "workspace.created",
      `update: ${svcUpdate.error?.code ?? "ALLOWED"}; delete: ${svcDelete.error?.code ?? "ALLOWED"}`,
    );

    const cEvents = await c.from("audit_events").select("id");
    check(
      "a member of a third company sees none of these events",
      !cEvents.error && !cEvents.data.some((e) => e.id === eventA || e.id === eventB),
      cEvents.error?.message ?? `got ${cEvents.data?.length} rows`,
    );

    // ---- Documents and file storage (E1.5.4) ---------------------------------
    console.log("\nDocuments, versions and files:");
    const BUCKET = "documents";
    const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

    /** One stored company document, made the way the server helper makes it. */
    async function seedDocument(orgId: string, label: string) {
      const documentId = randomUUID();
      const versionId = randomUUID();
      const path = `${orgId}/${documentId}/${versionId}`;
      const bytes = new TextEncoder().encode(`%PDF-1.4\n% verify-rls ${RUN} ${label}\n%%EOF\n`);
      const up = await admin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: "application/pdf" });
      if (up.error) throw new Error(`file upload failed: ${up.error.message}`);
      created.storagePaths.push(path);
      const rec = await admin.rpc("add_document_version", {
        p_organization_id: orgId,
        p_document_id: documentId,
        p_version_id: versionId,
        p_sha256: sha256(bytes),
        p_size_bytes: bytes.byteLength,
        p_mime_type: "application/pdf",
        p_original_file_name: `${label}.pdf`,
        p_uploaded_by: null,
        p_new_kind: "company",
        p_new_title: `${label} ${RUN}`,
        p_new_category: "csd",
      });
      if (rec.error) throw new Error(`version record failed: ${rec.error.message}`);
      return { documentId, versionId, path, bytes };
    }
    async function bytesOf(client: SupabaseClient, path: string): Promise<Uint8Array | null> {
      const r = await client.storage.from(BUCKET).download(path);
      return r.error || !r.data ? null : new Uint8Array(await r.data.arrayBuffer());
    }

    const docA = await seedDocument(orgA.id, "Alpha CSD");
    const docB = await seedDocument(orgB.id, "Beta CSD");

    const aDocs = await a.from("documents").select("id, organization_id");
    const aVersions = await a.from("document_versions").select("id, organization_id");
    check(
      "a member reads its own company's documents and versions only",
      !aDocs.error &&
        aDocs.data.some((d) => d.id === docA.documentId) &&
        aDocs.data.every((d) => d.organization_id === orgA.id) &&
        !aVersions.error &&
        aVersions.data.some((v) => v.id === docA.versionId) &&
        aVersions.data.every((v) => v.organization_id === orgA.id),
      aDocs.error?.message ?? aVersions.error?.message ?? `docs=${aDocs.data?.length}`,
    );

    const aReadsBDoc = await a.from("documents").select("id").eq("id", docB.documentId);
    const aReadsBVersion = await a.from("document_versions").select("id").eq("id", docB.versionId);
    check(
      "a member CANNOT read another company's document or version by id",
      aReadsBDoc.data?.length === 0 && aReadsBVersion.data?.length === 0,
      `doc=${aReadsBDoc.data?.length} version=${aReadsBVersion.data?.length}`,
    );

    const aInsertsDoc = await a
      .from("documents")
      .insert({ organization_id: orgA.id, kind: "company", title: "Forged" });
    const aInsertsVersion = await a.from("document_versions").insert({
      organization_id: orgA.id,
      document_id: docA.documentId,
      version_number: 9,
      storage_path: `${orgA.id}/${docA.documentId}/${randomUUID()}`,
      sha256: "0".repeat(64),
      size_bytes: 1,
      mime_type: "application/pdf",
      original_file_name: "forged.pdf",
    });
    const aRpc = await a.rpc("add_document_version", {
      p_organization_id: orgA.id,
      p_document_id: docA.documentId,
      p_version_id: randomUUID(),
      p_sha256: "0".repeat(64),
      p_size_bytes: 1,
      p_mime_type: "application/pdf",
      p_original_file_name: "forged.pdf",
      p_uploaded_by: null,
    });
    check(
      "a member CANNOT create documents or versions directly (no forged hashes)",
      aInsertsDoc.error !== null && aInsertsVersion.error !== null && aRpc.error !== null,
      `doc: ${aInsertsDoc.error?.code ?? "INSERTED"}; version: ${aInsertsVersion.error?.code ?? "INSERTED"}; rpc: ${aRpc.error?.code ?? "CALLED"}`,
    );

    const aEditsVersion = await a
      .from("document_versions")
      .update({ sha256: "f".repeat(64) })
      .eq("id", docA.versionId)
      .select("id");
    const aArchives = await a
      .from("documents")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", docA.documentId)
      .select("id");
    check(
      "a member CANNOT change a version or a document",
      (aEditsVersion.error !== null || aEditsVersion.data?.length === 0) &&
        (aArchives.error !== null || aArchives.data?.length === 0),
      `version: ${aEditsVersion.error?.code ?? aEditsVersion.data?.length}; document: ${aArchives.error?.code ?? aArchives.data?.length}`,
    );

    const svcEdit = await admin
      .from("document_versions")
      .update({ sha256: "f".repeat(64) })
      .eq("id", docA.versionId);
    const svcDeleteVersion = await admin
      .from("document_versions")
      .delete()
      .eq("id", docA.versionId);
    const svcDeleteDoc = await admin.from("documents").delete().eq("id", docA.documentId);
    const versionAfter = await admin
      .from("document_versions")
      .select("sha256")
      .eq("id", docA.versionId)
      .single();
    check(
      "even the service role CANNOT change or delete a version, or delete a document",
      svcEdit.error !== null &&
        svcDeleteVersion.error !== null &&
        svcDeleteDoc.error !== null &&
        versionAfter.data?.sha256 === sha256(docA.bytes),
      `edit: ${svcEdit.error?.code ?? "ALLOWED"}; delete version: ${svcDeleteVersion.error?.code ?? "ALLOWED"}; delete document: ${svcDeleteDoc.error?.code ?? "ALLOWED"}`,
    );

    const ownBytes = await bytesOf(a, docA.path);
    const ownList = await a.storage.from(BUCKET).list(`${orgA.id}/${docA.documentId}`);
    const ownSigned = await a.storage.from(BUCKET).createSignedUrl(docA.path, 60);
    check(
      "a member downloads, lists and links its own company's file",
      ownBytes !== null &&
        sha256(ownBytes) === sha256(docA.bytes) &&
        !ownList.error &&
        ownList.data.length === 1 &&
        !ownSigned.error,
      `download=${ownBytes === null ? "FAILED" : "ok"} list=${ownList.data?.length ?? ownList.error?.message} signed=${ownSigned.error?.message ?? "ok"}`,
    );

    const crossBytes = await bytesOf(a, docB.path);
    const crossList = await a.storage.from(BUCKET).list(orgB.id);
    const crossDocList = await a.storage.from(BUCKET).list(`${orgB.id}/${docB.documentId}`);
    const crossSigned = await a.storage.from(BUCKET).createSignedUrl(docB.path, 60);
    check(
      "a member CANNOT download, list or link another company's file",
      crossBytes === null &&
        (crossList.error !== null || crossList.data.length === 0) &&
        (crossDocList.error !== null || crossDocList.data.length === 0) &&
        crossSigned.error !== null,
      `download=${crossBytes === null ? "blocked" : "READ — CRITICAL"} list=${crossList.data?.length} docList=${crossDocList.data?.length} signed=${crossSigned.error ? "blocked" : "ISSUED — CRITICAL"}`,
    );

    const evil = new TextEncoder().encode(`%PDF-1.4\n% overwritten by A ${RUN}\n`);
    const overwrite = await a.storage
      .from(BUCKET)
      .upload(docB.path, evil, { contentType: "application/pdf", upsert: true });
    const updateB = await a.storage
      .from(BUCKET)
      .update(docB.path, evil, { contentType: "application/pdf" });
    const removeB = await a.storage.from(BUCKET).remove([docB.path]);
    const bAfter = await bytesOf(admin, docB.path);
    check(
      "a member CANNOT overwrite or delete another company's file",
      overwrite.error !== null &&
        updateB.error !== null &&
        bAfter !== null &&
        sha256(bAfter) === sha256(docB.bytes),
      `upsert: ${overwrite.error ? "blocked" : "ALLOWED"}; update: ${updateB.error ? "blocked" : "ALLOWED"}; remove: ${removeB.error ? "blocked" : `${removeB.data?.length ?? 0} removed`}; file ${bAfter === null ? "GONE — CRITICAL" : sha256(bAfter) === sha256(docB.bytes) ? "intact" : "CHANGED — CRITICAL"}`,
    );

    const ownPath = `${orgA.id}/${docA.documentId}/${randomUUID()}`;
    const ownUpload = await a.storage
      .from(BUCKET)
      .upload(ownPath, evil, { contentType: "application/pdf" });
    if (!ownUpload.error) created.storagePaths.push(ownPath);
    const ownOverwrite = await a.storage
      .from(BUCKET)
      .upload(docA.path, evil, { contentType: "application/pdf", upsert: true });
    await a.storage.from(BUCKET).remove([docA.path]);
    const aAfter = await bytesOf(admin, docA.path);
    check(
      "a member CANNOT upload, overwrite or delete files even in its own company (server helper only)",
      ownUpload.error !== null &&
        ownOverwrite.error !== null &&
        aAfter !== null &&
        sha256(aAfter) === sha256(docA.bytes),
      `upload: ${ownUpload.error ? "blocked" : "ALLOWED"}; upsert: ${ownOverwrite.error ? "blocked" : "ALLOWED"}; file ${aAfter === null ? "GONE" : "present"}`,
    );

    // ---- Memberships (E1.5.2) -------------------------------------------------
    console.log(
      "\nMemberships — user X, active member of A (bid_manager) and B (pricing_specialist):",
    );
    const orgC = cOnboard.data;
    if (typeof orgC !== "string") throw new Error("onboarding fixture missing");
    const emailX = `rls-x-${RUN}@example.com`;
    const userX = await createPerson(emailX, [
      [orgA.id, "bid_manager"],
      [orgB.id, "pricing_specialist"],
    ]);
    const x = await signIn(emailX);

    async function orgIdsSeen(client: SupabaseClient): Promise<string[]> {
      const r = await client.from("organizations").select("id");
      if (r.error) throw new Error(`organization read failed: ${r.error.message}`);
      return r.data.map((o: { id: string }) => o.id);
    }
    async function setMembershipStatus(orgId: string, status: "active" | "removed") {
      const r = await admin
        .from("memberships")
        .update({ status })
        .eq("user_id", userX)
        .eq("organization_id", orgId);
      if (r.error) throw new Error(`membership update failed: ${r.error.message}`);
    }

    const xOrgs = await orgIdsSeen(x);
    const xEvents = await x.from("audit_events").select("organization_id");
    const xProfiles = await x.from("profiles").select("id");
    check(
      "a person in two companies sees only the active one: its company, events and people",
      xOrgs.length === 1 &&
        xOrgs[0] === orgA.id &&
        !xEvents.error &&
        xEvents.data.length > 0 &&
        xEvents.data.every((e) => e.organization_id === orgA.id) &&
        !xProfiles.error &&
        xProfiles.data.some((p) => p.id === userA) &&
        !xProfiles.data.some((p) => p.id === userB),
      `orgs=${xOrgs.length} events=${xEvents.data?.length} profiles=${xProfiles.data?.length}`,
    );

    const aSeesX = await a.from("memberships").select("organization_id").eq("user_id", userX);
    check(
      "co-members see a person's membership in their company, not in other companies",
      !aSeesX.error && aSeesX.data.length === 1 && aSeesX.data[0]?.organization_id === orgA.id,
      aSeesX.error?.message ?? `got ${aSeesX.data?.length} rows`,
    );

    const xRenamesA = await x
      .from("organizations")
      .update({ name: `Alpha Bidders ${RUN} (by X)` })
      .eq("id", orgA.id)
      .select("id");
    const xSwitch = await x.rpc("switch_organization", { organization_id: orgB.id });
    const xOrgsAfterSwitch = await orgIdsSeen(x);
    const xRenamesB = await x
      .from("organizations")
      .update({ name: `Beta Contractors ${RUN} (by X)` })
      .eq("id", orgB.id)
      .select("id");
    check(
      "switching to the other company moves access and role there (bid_manager in A, pricing_specialist in B)",
      xRenamesA.data?.length === 1 &&
        !xSwitch.error &&
        xOrgsAfterSwitch.length === 1 &&
        xOrgsAfterSwitch[0] === orgB.id &&
        (xRenamesB.error !== null || xRenamesB.data?.length === 0),
      `renameA=${xRenamesA.data?.length} switch=${xSwitch.error?.code ?? "ok"} orgs=${xOrgsAfterSwitch.join(",").slice(0, 20)} renameB=${xRenamesB.data?.length}`,
    );

    const xToC = await x.rpc("switch_organization", { organization_id: orgC });
    check(
      "CANNOT switch to a company it is not a member of",
      xToC.error !== null && (await orgIdsSeen(x)).every((id) => id === orgB.id),
      xToC.error ? `blocked: ${xToC.error.code}` : "SWITCHED — CRITICAL",
    );

    const forged = await admin
      .from("profiles")
      .update({ active_organization_id: orgC })
      .eq("id", userX);
    if (forged.error) throw new Error(`selection update failed: ${forged.error.message}`);
    const xWithForged = await orgIdsSeen(x);
    check(
      "a stored selection of a non-member company grants nothing (falls back to a real membership)",
      xWithForged.length === 1 &&
        xWithForged[0] !== orgC &&
        [orgA.id, orgB.id].includes(xWithForged[0] ?? ""),
      `sees ${xWithForged.length} orgs${xWithForged.includes(orgC) ? " INCLUDING C — CRITICAL" : ""}`,
    );

    const xJoinsC = await x
      .from("memberships")
      .insert({ organization_id: orgC, user_id: userX, role: "executive_approver" });
    const aJoinsB = await a
      .from("memberships")
      .insert({ organization_id: orgB.id, user_id: userA, role: "bid_manager" });
    const joined = await admin
      .from("memberships")
      .select("id")
      .or(
        `and(user_id.eq.${userX},organization_id.eq.${orgC}),and(user_id.eq.${userA},organization_id.eq.${orgB.id})`,
      );
    check(
      "CANNOT add itself to a company",
      xJoinsC.error !== null && aJoinsB.error !== null && joined.data?.length === 0,
      `X: ${xJoinsC.error?.code ?? "INSERTED"}; A: ${aJoinsB.error?.code ?? "INSERTED"}`,
    );

    const xPromotes = await x
      .from("memberships")
      .update({ role: "executive_approver" })
      .eq("user_id", userX)
      .select("id");
    const xRoles = await admin.from("memberships").select("role").eq("user_id", userX);
    check(
      "CANNOT raise its own role",
      (xPromotes.error !== null || xPromotes.data?.length === 0) &&
        !xRoles.error &&
        !xRoles.data.some((m) => m.role === "executive_approver"),
      xPromotes.error
        ? `blocked: ${xPromotes.error.code}`
        : `affected ${xPromotes.data?.length} rows`,
    );

    const xSetsActive = await x
      .from("profiles")
      .update({ active_organization_id: orgB.id })
      .eq("id", userX);
    check(
      "CANNOT set its selected company directly (only through switch_organization)",
      xSetsActive.error !== null,
      xSetsActive.error ? `blocked: ${xSetsActive.error.code}` : "UPDATE SUCCEEDED",
    );

    const xBackToB = await x.rpc("switch_organization", { organization_id: orgB.id });
    await setMembershipStatus(orgB.id, "removed");
    const xAfterRemoval = await orgIdsSeen(x);
    const xToRemoved = await x.rpc("switch_organization", { organization_id: orgB.id });
    check(
      "a removed membership gives no access and cannot be switched to",
      !xBackToB.error &&
        xAfterRemoval.length === 1 &&
        xAfterRemoval[0] === orgA.id &&
        xToRemoved.error !== null,
      `switch=${xBackToB.error?.code ?? "ok"} sees=${xAfterRemoval.length} switchRemoved=${xToRemoved.error?.code ?? "ALLOWED"}`,
    );

    await setMembershipStatus(orgA.id, "removed");
    const xNoMembership = await orgIdsSeen(x);
    const xNoEvents = await x.from("audit_events").select("id");
    check(
      "with no active membership a person sees nothing (fails closed)",
      xNoMembership.length === 0 && !xNoEvents.error && xNoEvents.data.length === 0,
      `orgs=${xNoMembership.length} events=${xNoEvents.data?.length}`,
    );

    const helperRpc = await x.rpc("current_organization_id");
    const privateRpc = await x.schema("private").rpc("current_organization_id");
    check(
      "the session helpers are not reachable through the API",
      helperRpc.error !== null && privateRpc.error !== null,
      `public: ${helperRpc.error?.code ?? "ok"}; private: ${privateRpc.error?.code ?? "ok"}`,
    );

    // ---- Anonymous access ---------------------------------------------------
    console.log("\nAnonymous (no session):");
    const anon = createClient(URL, PUBLISHABLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonOrgs = await anon.from("organizations").select("id");
    check(
      "anonymous callers see no organizations",
      anonOrgs.error !== null || anonOrgs.data?.length === 0,
      anonOrgs.error ? `blocked: ${anonOrgs.error.code}` : `got ${anonOrgs.data?.length} rows`,
    );
    const anonOnboard = await anon.rpc("complete_onboarding", {
      company_name: `Anon ${RUN}`,
      full_name: "Anon",
    });
    check(
      "anonymous callers CANNOT run onboarding",
      anonOnboard.error !== null && (await orgsNamed(`Anon ${RUN}`)) === 0,
      anonOnboard.error ? `blocked: ${anonOnboard.error.code}` : "ANON WORKSPACE CREATED",
    );
    const anonEvents = await anon.from("audit_events").select("id");
    check(
      "anonymous callers see no audit events",
      anonEvents.error !== null || anonEvents.data?.length === 0,
      anonEvents.error
        ? `blocked: ${anonEvents.error.code}`
        : `got ${anonEvents.data?.length} rows`,
    );
    const anonSwitch = await anon.rpc("switch_organization", { organization_id: orgA.id });
    const anonMemberships = await anon.from("memberships").select("id");
    check(
      "anonymous callers see no memberships and cannot switch company",
      anonSwitch.error !== null &&
        (anonMemberships.error !== null || anonMemberships.data?.length === 0),
      `switch: ${anonSwitch.error?.code ?? "ALLOWED"}; memberships: ${anonMemberships.error?.code ?? anonMemberships.data?.length}`,
    );
    const anonDocs = await anon.from("documents").select("id");
    const anonVersions = await anon.from("document_versions").select("id");
    const anonFile = await anon.storage.from("documents").download(docA.path);
    check(
      "anonymous callers see no documents, versions or files",
      (anonDocs.error !== null || anonDocs.data?.length === 0) &&
        (anonVersions.error !== null || anonVersions.data?.length === 0) &&
        anonFile.error !== null,
      `documents: ${anonDocs.error?.code ?? anonDocs.data?.length}; file: ${anonFile.error ? "blocked" : "READ — CRITICAL"}`,
    );
    const anonProfiles = await anon.from("profiles").select("id");
    check(
      "anonymous callers see no profiles",
      anonProfiles.error !== null || anonProfiles.data?.length === 0,
      anonProfiles.error
        ? `blocked: ${anonProfiles.error.code}`
        : `got ${anonProfiles.data?.length} rows`,
    );
  } finally {
    // ---- Teardown ----------------------------------------------------------
    console.log("\nTeardown:");
    // Files are not tied to rows by a foreign key, so they go explicitly.
    if (created.storagePaths.length > 0) {
      const { data, error } = await admin.storage.from("documents").remove(created.storagePaths);
      if (error) cleanupFailures += 1;
      console.log(
        `  files ${error ? `NOT removed: ${error.message}` : `${data.length}/${created.storagePaths.length} removed`}`,
      );
    }
    for (const id of created.userIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) cleanupFailures += 1;
      console.log(
        `  user ${id.slice(0, 8)} ${error ? `NOT deleted: ${error.message}` : "deleted"}`,
      );
    }
    // Profiles cascade with the user; organizations must go explicitly. Sweep by the
    // run suffix too, so an organization from a call that wrongly succeeded is removed.
    const swept = await admin.from("organizations").select("id").like("name", `%${RUN}%`);
    for (const row of swept.data ?? []) {
      if (!created.orgIds.includes(row.id)) created.orgIds.push(row.id);
    }
    for (const id of created.orgIds) {
      // Their audit events cascade with them (the one deletion audit_events allows).
      const { error } = await admin.from("organizations").delete().eq("id", id);
      if (error) cleanupFailures += 1;
      console.log(
        `  org  ${id.slice(0, 8)} ${error ? `NOT deleted: ${error.message}` : "deleted"}`,
      );
    }
  }

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) {
    console.error(`${failures} FAILED — tenant isolation is not intact.`);
    process.exit(1);
  }
  if (cleanupFailures > 0) {
    console.error(`${cleanupFailures} fixture(s) NOT cleaned up — see Teardown above.`);
    process.exit(1);
  }
  console.log("Tenant isolation verified.");
}

main().catch((e: unknown) => {
  console.error("\nverify-rls crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});

import { randomUUID } from "node:crypto";

import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { type Database } from "@/lib/supabase/database.types";

import {
  DOCUMENTS_BUCKET,
  MAX_FILE_BYTES,
  sha256Hex,
  sniffMimeType,
  versionStoragePath,
} from "./files";

/**
 * Stores a file as a new, immutable document version (E1.5.4): hash, duplicate check
 * within the company, upload, then one database call (`add_document_version`) that
 * re-checks for duplicates under a lock, records the version and writes its audit
 * entry in one transaction.
 *
 * This core takes the client and the acting company as arguments so tests can drive
 * it; the app calls it only through `uploadDocumentFile` (`./upload.ts`), which checks
 * the person's permission and passes the service-role client. Everything here is
 * scoped to `actor.organizationId`, which must come from the session, never from input.
 */

const DocumentKindSchema = z.enum(["company", "tender"]);

export const StoreDocumentInputSchema = z.object({
  target: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("new"),
      document: z.object({
        kind: DocumentKindSchema,
        title: z.string().trim().min(1).max(300),
        category: z
          .string()
          .regex(/^[a-z][a-z0-9_]{0,59}$/)
          .optional(),
      }),
    }),
    z.object({ type: z.literal("existing"), documentId: z.uuid() }),
  ]),
  file: z.object({
    name: z.string().trim().min(1).max(255),
    bytes: z.instanceof(Uint8Array),
  }),
});

export type StoreDocumentInput = z.input<typeof StoreDocumentInputSchema>;

export type StoredVersion = {
  documentId: string;
  versionId: string;
  versionNumber: number;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  storagePath: string;
};

export type StoreDocumentResult =
  | { status: "stored"; version: StoredVersion }
  /** These exact bytes are already stored in this company; nothing was written. */
  | {
      status: "duplicate";
      existing: { documentId: string; versionId: string; versionNumber: number; title: string };
    };

export type DocumentStoreErrorCode = "invalid_file" | "not_found" | "archived";

/** An expected refusal, with a message that can be shown to the person as is. */
export class DocumentStoreError extends Error {
  constructor(
    readonly code: DocumentStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DocumentStoreError";
  }
}

/** The company the file belongs to and the person uploading it, both from the session. */
export type DocumentActor = { organizationId: string; userId: string };

type Duplicate = Extract<StoreDocumentResult, { status: "duplicate" }>["existing"];

/**
 * The earliest stored version with these exact bytes in this company, ignoring
 * archived documents (an archived document must not block storing the file again).
 */
async function findDuplicate(
  db: SupabaseClient<Database>,
  organizationId: string,
  sha256: string,
): Promise<Duplicate | null> {
  const { data, error } = await db
    .from("document_versions")
    .select(
      "id, document_id, version_number, document:documents!document_versions_document_fkey!inner (title, archived_at)",
    )
    .eq("organization_id", organizationId)
    .eq("sha256", sha256)
    .is("document.archived_at", null)
    .order("uploaded_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Duplicate check failed: ${error.message}`);
  if (data === null) return null;
  return {
    documentId: data.document_id,
    versionId: data.id,
    versionNumber: data.version_number,
    title: data.document.title,
  };
}

export async function storeDocumentVersion(
  db: SupabaseClient<Database>,
  actor: DocumentActor,
  input: StoreDocumentInput,
): Promise<StoreDocumentResult> {
  const parsed = StoreDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DocumentStoreError("invalid_file", "Check the document's title and file.");
  }
  const { target, file } = parsed.data;

  if (file.bytes.byteLength === 0) {
    throw new DocumentStoreError("invalid_file", "The file is empty.");
  }
  if (file.bytes.byteLength > MAX_FILE_BYTES) {
    throw new DocumentStoreError("invalid_file", "Files can be up to 50 MB.");
  }
  const mimeType = sniffMimeType(file.bytes);
  if (mimeType === null) {
    throw new DocumentStoreError("invalid_file", "Upload a PDF, JPEG, PNG or WebP file.");
  }

  let documentId: string;
  if (target.type === "existing") {
    const existing = await db
      .from("documents")
      .select("id, archived_at")
      .eq("id", target.documentId)
      .eq("organization_id", actor.organizationId)
      .maybeSingle();
    if (existing.error) throw new Error(`Document lookup failed: ${existing.error.message}`);
    if (existing.data === null) {
      throw new DocumentStoreError("not_found", "That document was not found.");
    }
    if (existing.data.archived_at !== null) {
      throw new DocumentStoreError("archived", "That document is archived.");
    }
    documentId = existing.data.id;
  } else {
    documentId = randomUUID();
  }

  const sha256 = sha256Hex(file.bytes);
  const duplicate = await findDuplicate(db, actor.organizationId, sha256);
  if (duplicate !== null) return { status: "duplicate", existing: duplicate };

  const versionId = randomUUID();
  const storagePath = versionStoragePath(actor.organizationId, documentId, versionId);
  const bucket = db.storage.from(DOCUMENTS_BUCKET);

  // File first, then the record: a version row must never point at a missing file.
  // The path holds a fresh id, and upsert is off, so nothing is ever overwritten.
  const upload = await bucket.upload(storagePath, file.bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (upload.error) throw new Error(`File upload failed: ${upload.error.message}`);

  const args: Database["public"]["Functions"]["add_document_version"]["Args"] = {
    p_organization_id: actor.organizationId,
    p_document_id: documentId,
    p_version_id: versionId,
    p_sha256: sha256,
    p_size_bytes: file.bytes.byteLength,
    p_mime_type: mimeType,
    p_original_file_name: file.name,
    p_uploaded_by: actor.userId,
  };
  if (target.type === "new") {
    args.p_new_kind = target.document.kind;
    args.p_new_title = target.document.title;
    if (target.document.category !== undefined) args.p_new_category = target.document.category;
  }
  const recorded = await db.rpc("add_document_version", args);

  if (recorded.error) {
    // The version was never recorded, so this file is not an original yet: remove it.
    const removed = await bucket.remove([storagePath]);
    if (removed.error) {
      console.error(`Unrecorded file left in storage: ${storagePath}`);
    }
    // Someone stored the same bytes in the moment between our check and the
    // record (the database re-checks under a lock and answers PT409).
    if (recorded.error.code === "PT409") {
      const existing = await findDuplicate(db, actor.organizationId, sha256);
      if (existing !== null) return { status: "duplicate", existing };
    }
    if (recorded.error.code === "55000") {
      throw new DocumentStoreError("archived", "That document is archived.");
    }
    if (recorded.error.code === "P0002") {
      throw new DocumentStoreError("not_found", "That document was not found.");
    }
    throw new Error(`Version was not recorded: ${recorded.error.message}`);
  }

  return {
    status: "stored",
    version: {
      documentId,
      versionId: recorded.data.id,
      versionNumber: recorded.data.version_number,
      sha256: recorded.data.sha256,
      sizeBytes: recorded.data.size_bytes,
      mimeType: recorded.data.mime_type,
      storagePath: recorded.data.storage_path,
    },
  };
}

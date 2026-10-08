import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/workspace/membership";

import { type StoreDocumentInput, type StoreDocumentResult, storeDocumentVersion } from "./store";

/**
 * The one way the app stores a file (Architecture rule 4). Checks that the signed-in
 * person may upload (`documents.upload`), then hashes, de-duplicates within their
 * active company, stores and records the version with the service role. The database
 * writes the audit entry with the version.
 *
 * Throws PermissionDeniedError (role) or DocumentStoreError (file, missing or archived
 * document) with a message that can be shown as is; anything else is a server fault.
 *
 * Vercel limits a request body to 4.5 MB, so a Server Action can pass only files up
 * to that size; larger files need a direct upload to a staging path first (E2.2).
 */
export async function uploadDocumentFile(input: StoreDocumentInput): Promise<StoreDocumentResult> {
  const membership = await requirePermission("documents.upload");
  // The `document.uploaded` audit entry is written by `add_document_version`, in the
  // same transaction as the version, for the version's own company.
  return storeDocumentVersion(
    createSupabaseAdminClient(),
    { organizationId: membership.organization.id, userId: membership.userId },
    input,
  );
}

import { createHash } from "node:crypto";

/**
 * File rules for documents (E1.5.4). Pure functions, unit-tested in
 * `tests/unit/document-files.test.ts`.
 */

export const DOCUMENTS_BUCKET = "documents";

/** What the AI can read natively, and what the `documents` bucket accepts. */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** The bucket's limit (the Supabase Free plan's maximum upload size). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

const PDF_MARKER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
/** PDF readers accept the header anywhere in the first 1024 bytes. */
const PDF_HEADER_WINDOW = 1024;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * The file's real type, read from its first bytes, or null if it is not one we accept.
 * The browser's declared type and the file name are never trusted: a renamed file
 * would otherwise be stored and served under the wrong type.
 */
export function sniffMimeType(bytes: Uint8Array): AllowedMimeType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // "RIFF" <4-byte size> "WEBP"
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  const window = Math.min(bytes.length, PDF_HEADER_WINDOW) - PDF_MARKER.length;
  for (let offset = 0; offset <= window; offset += 1) {
    if (startsWith(bytes, PDF_MARKER, offset)) return "application/pdf";
  }
  return null;
}

/** Lowercase hex SHA-256 of the exact bytes stored. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Where a version's file lives. The company comes first because the storage policy
 * reads it from there; the database checks every version's path has this shape.
 */
export function versionStoragePath(
  organizationId: string,
  documentId: string,
  versionId: string,
): string {
  return `${organizationId}/${documentId}/${versionId}`;
}

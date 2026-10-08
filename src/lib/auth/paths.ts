/**
 * Route access rules, shared by `proxy.ts`, the auth actions and the auth callback.
 * Pure functions with no Next.js or Supabase imports, so the proxy bundle stays small.
 */

/** Pages only a signed-out visitor needs. A signed-in visitor is sent on to the app. */
const GUEST_ONLY_PATHS: ReadonlySet<string> = new Set(["/login", "/signup", "/forgot-password"]);

/**
 * Reachable without a session: the guest pages, the email-link landing route, and the
 * job runner, which Vercel Cron calls with its own secret instead of a session.
 */
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  ...GUEST_ONLY_PATHS,
  "/auth/callback",
  "/api/jobs/run",
]);

export function isGuestOnlyPath(pathname: string): boolean {
  return GUEST_ONLY_PATHS.has(pathname);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

/** A fixed origin to resolve against; only used to tell "same site" from "elsewhere". */
const BASE = "http://next.invalid";

/**
 * Where to send someone after they sign in, taken from a `next` parameter.
 *
 * Only same-site relative paths are accepted, decided by the URL parser itself rather
 * than by prefix checks: parsers drop tabs and newlines and read a backslash as `/`, so
 * `/\t/evil.example` or `/\\evil.example` would otherwise become a protocol-relative
 * link to another site and turn the login page into an open redirect. Guest-only
 * pages are refused too, so a signed-in user is never bounced back to the login form.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  // Control characters and backslashes have no place in our own paths.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return "/";
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE || isGuestOnlyPath(url.pathname)) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

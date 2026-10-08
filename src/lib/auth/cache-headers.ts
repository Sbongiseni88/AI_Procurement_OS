/**
 * The headers `@supabase/ssr` asks for on any response that writes auth cookies.
 * A CDN or proxy that cached such a response could serve one user's session to
 * another (ARCHITECTURE.md §7).
 */
export const NO_STORE_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};

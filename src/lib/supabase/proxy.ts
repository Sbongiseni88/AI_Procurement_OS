import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env/public";
import { isGuestOnlyPath, isPublicPath, safeNextPath } from "@/lib/auth/paths";

import type { Database } from "./database.types";

/**
 * Session refresh + route guard, called from `src/proxy.ts` on every page request.
 *
 * This is the one place that writes refreshed auth cookies for page loads, which is
 * why the server client may swallow cookie writes inside Server Components (see
 * `server.ts`). Two rules from `@supabase/ssr` are load-bearing here:
 *
 * 1. Cookies written by `setAll` go on BOTH the forwarded request (so Server
 *    Components rendering this request see the fresh session) and the response.
 * 2. The `headers` argument of `setAll` (Cache-Control: no-store and friends) MUST be
 *    applied to the response. A CDN that cached a response carrying one user's
 *    session cookie would hand that session to the next visitor.
 *
 * Redirects are built with `withSession` so they keep both the cookies and the
 * cache headers; a bare `NextResponse.redirect` would silently drop them.
 *
 * Server Actions (log in, log out, new password) also write auth cookies but cannot
 * set response headers. They do not need to: Next's production server already sends
 * `Cache-Control: private, no-cache, no-store` on every action response, and
 * `tests/e2e/auth.spec.ts` asserts it. (`next dev` rewrites Cache-Control, which is
 * why the E2E suite runs against `next start`.)
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          cacheHeaders = { ...cacheHeaders, ...headers };
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Do not put code between client creation and this call: it is what refreshes an
  // expired access token. `getClaims` verifies the JWT rather than trusting the
  // cookie, unlike `getSession`.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = data?.claims !== undefined && data.claims !== null;
  const { pathname, search } = request.nextUrl;

  function withSession(target: URL): NextResponse {
    const redirect = NextResponse.redirect(target);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    for (const [key, value] of Object.entries(cacheHeaders)) {
      redirect.headers.set(key, value);
    }
    return redirect;
  }

  if (!isSignedIn && !isPublicPath(pathname)) {
    const login = new URL("/login", request.url);
    const next = safeNextPath(`${pathname}${search}`);
    if (next !== "/") login.searchParams.set("next", next);
    return withSession(login);
  }

  if (isSignedIn && isGuestOnlyPath(pathname)) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return withSession(new URL(next, request.url));
  }

  return response;
}

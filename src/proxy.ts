import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts` (ARCHITECTURE.md §4). Runs on the
 * Node.js runtime before every page request: refreshes the Supabase session and
 * redirects signed-out visitors to /login.
 *
 * This is a convenience gate, not the security boundary. Pages still check the user
 * themselves and RLS enforces tenancy in the database.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

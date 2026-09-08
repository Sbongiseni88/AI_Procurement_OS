import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env/public";

import type { Database } from "./database.types";

/**
 * Server Supabase client, for Server Components, Server Actions and Route Handlers.
 *
 * Uses the PUBLISHABLE key on purpose: this client acts as the signed-in user, so
 * Row Level Security still applies. Reach for `createSupabaseAdminClient` only when
 * you explicitly need to bypass RLS.
 *
 * Two version-specific details matter here:
 *
 * 1. `cookies()` MUST be awaited. Next.js 16 removed synchronous access to request
 *    APIs outright (see docs/ARCHITECTURE.md §4) — it is no longer a warning.
 * 2. A NEW client must be created per request. Never hoist this to module scope:
 *    a shared client would leak one user's session into another user's request.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot mutate cookies — Next.js throws here by
            // design. This is safe to swallow ONLY because `proxy.ts` (T1.4)
            // refreshes the session on every request and writes the refreshed
            // cookies to the response, including the required no-store cache
            // headers. If that proxy is ever removed, sessions will silently
            // expire early and users will be logged out at random.
          }
        },
      },
    },
  );
}

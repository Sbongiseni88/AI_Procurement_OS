"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env/public";

import type { Database } from "./database.types";

/**
 * Browser Supabase client, for Client Components.
 *
 * Authenticated as the signed-in user (or anonymous), so every query is subject to
 * Row Level Security. Cookie handling is deliberately left to the library default,
 * which reads and writes `document.cookie` — that is the same cookie store the
 * server client and `proxy.ts` (T1.4) read, which is what keeps a session coherent
 * across the server/client boundary.
 *
 * `createBrowserClient` is internally a singleton, so calling this per component is
 * cheap and does not open redundant connections.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

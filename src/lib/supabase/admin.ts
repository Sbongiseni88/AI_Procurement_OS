import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env/public";
import { serverEnv } from "@/lib/env/server";

import type { Database } from "./database.types";

/**
 * Privileged Supabase client. **This client BYPASSES Row Level Security.**
 *
 * It is built on `@supabase/supabase-js` rather than `@supabase/ssr` because it is
 * intentionally session-less: it acts as the service role, not as a user, so there
 * is no cookie state to carry and none should be persisted.
 *
 * Rules for using it (CLAUDE.md §3, Phase 1 multi-tenancy):
 *
 * - Every call site MUST have already authorised the caller and MUST filter by the
 *   `organization_id` derived from the session — never from client input. RLS is
 *   not there to catch your mistake here, because RLS is switched off.
 * - Prefer `createSupabaseServerClient()`. Reach for this only for genuine
 *   cross-tenant work: migrations, scheduled jobs, and admin tooling.
 * - Never import this from a Client Component. The `server-only` import makes that
 *   a build error.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

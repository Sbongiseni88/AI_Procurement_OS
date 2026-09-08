import "server-only";

import { z } from "zod";

/**
 * Server-only environment.
 *
 * The `server-only` import above is the enforcement mechanism: importing this
 * module from a Client Component is a BUILD-time error, not a runtime surprise.
 * That matters because `SUPABASE_SECRET_KEY` bypasses Row Level Security
 * entirely — leaking it would expose every tenant's bid pricing to every other.
 */
const ServerEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1).startsWith("sb_secret_", {
    error: "SUPABASE_SECRET_KEY must start with 'sb_secret_'.",
  }),
  /** Project reference, used by the Supabase CLI for migrations and type codegen. */
  SUPABASE_PROJECT_ID: z.string().min(1),
});

const parsed = ServerEnvSchema.safeParse({
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  SUPABASE_PROJECT_ID: process.env.SUPABASE_PROJECT_ID,
});

if (!parsed.success) {
  throw new Error(
    `Invalid server environment configuration:\n${z.prettifyError(parsed.error)}\n\n` +
      `Copy .env.local.example to .env.local and fill in the values.`,
  );
}

export const serverEnv = parsed.data;

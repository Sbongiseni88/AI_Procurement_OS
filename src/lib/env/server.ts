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
  /**
   * Protects the job runner route (E1.5.5); Vercel Cron sends it as
   * `Authorization: Bearer <value>`. Optional so the app builds and runs without it:
   * the route then refuses every request, and jobs still run after each enqueue.
   * Checked by the route itself (at least 16 characters), not here, so a bad value
   * disables the runner instead of the whole app.
   */
  CRON_SECRET: z.string().optional(),
});

const parsed = ServerEnvSchema.safeParse({
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
});

if (!parsed.success) {
  throw new Error(
    `Invalid server environment configuration:\n${z.prettifyError(parsed.error)}\n\n` +
      `Copy .env.local.example to .env.local and fill in the values.`,
  );
}

export const serverEnv = parsed.data;

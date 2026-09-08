import { z } from "zod";

/**
 * Public environment — safe on both the server and in the browser.
 *
 * Next.js inlines `NEXT_PUBLIC_*` values into the client bundle at build time, so
 * each variable must be referenced as a literal `process.env.NEXT_PUBLIC_X`
 * expression below. Dynamic lookups (`process.env[name]`) are NOT replaced by the
 * compiler and would arrive as `undefined` in the browser.
 */
const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "NEXT_PUBLIC_SUPABASE_URL must be the project URL, e.g. https://<ref>.supabase.co",
  }),
  /**
   * The publishable key is designed to ship to browsers; Row Level Security is
   * what actually protects the data. The `startsWith` guard is a safety catch for
   * the one mistake that would be catastrophic here: pasting the SECRET key into
   * a NEXT_PUBLIC_ variable would inline an RLS-bypassing credential into every
   * page of the app.
   */
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1)
    .startsWith("sb_publishable_", {
      error:
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must start with 'sb_publishable_'. " +
        "If you pasted an 'sb_secret_' key here, remove it immediately and rotate it — " +
        "NEXT_PUBLIC_ values are inlined into the browser bundle.",
    }),
});

const parsed = PublicEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

if (!parsed.success) {
  throw new Error(
    `Invalid public environment configuration:\n${z.prettifyError(parsed.error)}\n\n` +
      `Copy .env.local.example to .env.local and fill in the values.`,
  );
}

export const publicEnv = parsed.data;

/**
 * Generated database types.
 *
 * PLACEHOLDER — the schema does not exist yet. T1.3 creates the first migration
 * (`organizations`, `profiles`, RBAC + RLS), after which this file is REPLACED by:
 *
 *   npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" \
 *     > src/lib/supabase/database.types.ts
 *
 * Until then this empty-but-valid shape keeps the clients generically typed rather
 * than falling back to the library's internal `any` default, which CLAUDE.md §1.3
 * forbids. Queries against tables will not typecheck until the real types land —
 * that is intentional, not a defect.
 */
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

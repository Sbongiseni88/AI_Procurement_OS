# Project skills

Third-party skills vendored into the repo so every collaborator gets the same versions. Each was read in full before adding; none contain executable scripts. To update one, re-download it, review the diff, and commit.

| Skill | Source | Version | Used for |
|---|---|---|---|
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) | `683bc88` (2026-10-05) | Building UI without generic "AI" styling |
| `web-design-guidelines` | [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) | `434b7f9` (2026-10-05) | Accessibility/UX audit of UI code (vendored, see its SKILL.md) |
| `react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `063bee9` (2026-08-28) | Next.js/React patterns: server actions auth, waterfalls, bundle size |
| `supabase` | [supabase/agent-skills](https://github.com/supabase/agent-skills) | `c9be0e9` (2026-10-02) | Supabase auth, RLS security checklist, CLI, storage |
| `supabase-postgres-best-practices` | [supabase/agent-skills](https://github.com/supabase/agent-skills) | `c9be0e9` (2026-10-02) | Schema, migrations, indexes, RLS policies |

These are reference guidance, not a mandate: CLAUDE.md's "do not over-engineer" rule wins. Don't add a library (SWR, LRU caches, virtualization) just because a rule mentions it.

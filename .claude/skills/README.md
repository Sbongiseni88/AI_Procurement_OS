# Project skills

Skills vendored into the repo so every collaborator gets the same versions. Each third-party skill was read in full before adding; none contain executable scripts. To update one, re-download it, review the diff, and commit.

| Skill | Source | Version | Used for |
|---|---|---|---|
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) | `683bc88` (2026-10-05) | Building UI without generic "AI" styling |
| `web-design-guidelines` | [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) | `434b7f9` (2026-10-05) | Accessibility/UX audit of UI code (vendored, see its SKILL.md) |
| `react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `063bee9` (2026-08-28) | Next.js/React patterns: server actions auth, waterfalls, bundle size |
| `supabase` | [supabase/agent-skills](https://github.com/supabase/agent-skills) | `c9be0e9` (2026-10-02) | Supabase auth, RLS security checklist, CLI, storage |
| `supabase-postgres-best-practices` | [supabase/agent-skills](https://github.com/supabase/agent-skills) | `c9be0e9` (2026-10-02) | Schema, migrations, indexes, RLS policies |
| `ponytail` | [dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail) | `9cc65d0` (2026-10-08) | "Smallest complete change" mode for any coding task (`/ponytail`, levels lite/full/ultra) |
| `ponytail-review` | same | `9cc65d0` | Plain-English review of a change: bugs, security, load, missing tests, what to cut |
| `ponytail-audit` | same | `9cc65d0` | Whole-repo audit, ranked findings, changes nothing |
| `ponytail-debt` | same | `9cc65d0` | Lists every `shortcut:` comment as a debt ledger |
| `typescript-best-practices` | written for this repo | 1.0 (2026-10-08) | Strict TS, Zod at boundaries, generated DB types, `as const` unions, exhaustive switches, dates in SAST |

These are reference guidance, not a mandate: CLAUDE.md's "do not over-engineer" rule wins. Don't add a library (SWR, LRU caches, virtualization) just because a rule mentions it.

**Ponytail notes.** Only the `skills/` folder of the ponytail plugin is vendored. Its hooks (which auto-activate it every session and add a status line) and its `ponytail-help` / `ponytail-gain` skills (plugin config and benchmark marketing) are deliberately left out, so ponytail runs only when invoked. Its "no abstraction nobody asked for" rule does not override the Architecture rules in `docs/TASKS.md`: the client explicitly asked for the AI gateway, permission matrix, versioned documents, and events/jobs, so those are requirements, not speculation.

**Why the TypeScript skill is our own.** No official TypeScript skill exists from Anthropic, Vercel or Microsoft. The community options reviewed (jwynia/agent-skills `typescript-best-practices`, ~21k words with Deno scripts and service/DI templates; wshobson/agents `typescript-advanced-types`, type-level tricks) push patterns this repo avoids. This one codifies the conventions already in `src/lib/` instead.

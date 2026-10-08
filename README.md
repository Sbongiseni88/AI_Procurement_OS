# AI Procurement OS
test push
Tender compliance checker for South African bidders. Upload a tender and your company
documents, and it shows what the tender requires, which documents meet it, and which are
**expired, expiring, certified too long ago, missing or in conflict**. AI reads the
documents; deterministic rules decide the status; a person confirms every finding.

**Status:** Phase 1 under construction, due 13 Nov 2026. See [docs/TASKS.md](docs/TASKS.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Lucide ·
Supabase (Postgres + RLS + Auth + Storage) · Anthropic API (Claude Opus 5.5) · Vercel

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in from Supabase: Project Settings → API Keys
npm run dev                        # http://localhost:3000
```

`.env.local` is gitignored and must stay that way: `SUPABASE_SECRET_KEY` bypasses Row Level
Security entirely.

## Scripts

| Command              | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `npm run dev`        | Development server (Turbopack)                             |
| `npm run build`      | Production build                                           |
| `npm run typecheck`  | `tsc --noEmit`                                             |
| `npm run lint`       | ESLint (`lint:fix` to autofix)                             |
| `npm run format`     | Prettier write (`format:check` in CI)                      |
| `npm run db:link`    | Link the Supabase CLI to the hosted project                |
| `npm run db:push`    | Apply new migrations to the hosted database                |
| `npm run db:types`   | Regenerate `database.types.ts` (run after every migration) |
| `npm run test:e2e`   | Playwright end-to-end tests (builds, serves on :3100)      |
| `npm run test:unit`  | Unit tests for pure logic (`node --test`)                  |
| `npm run verify:rls` | Live tenant-isolation test against the hosted database     |

Every ticket must pass `typecheck`, `lint`, `format:check`, `build` and `test:e2e` before it is
committed. First run of `test:e2e` on a new machine: `npx playwright install chromium`.

## Documentation

| Document                                               | Contents                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                                 | Engineering rules, UI direction, scope, per-ticket protocol    |
| [docs/TASKS.md](docs/TASKS.md)                         | Epics E1–E5, tickets, handoff notes, waiting-on-client, log    |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)           | System diagram, constraints, data model, RLS, AI, decision log |
| [docs/API_AND_DATA_FLOW.md](docs/API_AND_DATA_FLOW.md) | Server actions, route handlers, schemas, AI payload contracts  |
| [.claude/skills/README.md](.claude/skills/README.md)   | Vendored Claude skills and their sources                       |

## Client data

Real client documents (ID numbers, bank details, certified copies) go in `/fixtures/private/`,
which is gitignored. Never commit them, log them, or paste their contents into docs.

# AI Procurement OS

South African tender compliance and bid preparation intelligence. Ingests a tender
document into a structured **Digital Twin**, cross-references its requirements against your
**Company DNA** evidence locker, surfaces the compliance gaps, prices the BOQ across margin
scenarios, and compiles an indexed submission pack — behind a mandatory human approval gate.

**Status:** V1 MVP under construction. See [docs/TASKS.md](docs/TASKS.md) for the board.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Lucide ·
Supabase (Postgres + RLS + Auth + Storage + pgvector) · Anthropic API · Vercel

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

### Environment

```bash
cp .env.local.example .env.local
```

Fill in the values from your Supabase dashboard (Project Settings → API Keys).
`.env.local` is gitignored and must stay that way — `SUPABASE_SECRET_KEY` bypasses Row
Level Security entirely.

## Scripts

| Command                | Purpose                        |
| ---------------------- | ------------------------------ |
| `npm run dev`          | Development server (Turbopack) |
| `npm run build`        | Production build               |
| `npm run typecheck`    | `tsc --noEmit`                 |
| `npm run lint`         | ESLint                         |
| `npm run lint:fix`     | ESLint with autofix            |
| `npm run format`       | Prettier write                 |
| `npm run format:check` | Prettier check (CI)            |

Every task must pass `typecheck`, `lint` and `build` before it is committed.

## Documentation

| Document                                               | Contents                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)           | System diagrams, stack, Next.js 16 constraints, design tokens, decision log |
| [docs/TASKS.md](docs/TASKS.md)                         | Kanban board, blockers, completion log                                      |
| [docs/API_AND_DATA_FLOW.md](docs/API_AND_DATA_FLOW.md) | Endpoints, schemas, AI payload contracts                                    |

## Design reference

[`v1Prototype/index.html`](v1Prototype/index.html) is the frozen static prototype and the
source of truth for visual design. It is excluded from lint and formatting, and is never
edited — the application ports its layout and palette rather than replacing them.

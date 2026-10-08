# Project: AI Procurement OS — Phase 1: Tender Compliance (first production module)

You are the lead engineer building **AI Procurement OS** for a South African client who submits government tenders and RFQs.
Phase 1 is the **first production module** of the AI Procurement OS, not a standalone app: tender compliance. Upload a tender and the company's documents, and the system shows what the tender requires, which documents meet the rules the tender states, and which are expired, expiring, certified too long ago (by the tender's own rule), missing or in conflict. It is built on a shared platform core (companies and memberships, permissions, audit, versioned documents, events and jobs, AI gateway) that every later module reuses. The client uses it for his own company first; selling it to other companies is a later phase.

The client's long-term vision is in the Master Developer Booklet (45 builds). Treat it as direction, not scope. Phase 1 scope is defined in `docs/TASKS.md`.

---

## 1. Non-Negotiable Engineering Rules

1. **Do not over-engineer:** Build strictly what the current ticket says. No microservices, queues, Python services, Docker, or premature abstractions. Lean, modular, maintainable. A solo developer works 2–4 hours a day; every addition must earn its place.
2. **UI direction — minimal, work-management style:** Follow the booklet's Monday.com-style structure (workspace, tender board/list, statuses, owners, deadlines) but keep it simple and quiet. It is a working tool for tender teams, not a marketing page. The old static prototype has been removed; the UI is designed fresh.
   - No "AI slop": no purple/violet or neon-green accents, no gradients, no glows or glassmorphism, no emoji as icons, no identical rounded cards with soft shadows everywhere, no decorative animation.
   - Neutral, restrained palette with one accent; color is reserved for meaning (status pills: compliant, expiring, expired, missing, conflict, needs verification, unable to verify).
   - Plain-language copy in sentence case; Lucide icons only where they aid scanning.
   - Use the `frontend-design` skill when building UI and the `web-design-guidelines` skill to audit it before a UI task is marked done.
3. **Strict TypeScript:**
   - Strict TypeScript everywhere (no `any`, no unsafe casts).
   - Repository/service functions for Supabase queries, explicit DTOs, Zod at every boundary (form input, server actions, AI output).
   - Use the right data structure: `Map`/`Set` lookups when matching requirements to documents; pure, unit-tested functions for expiry and compliance rules.
4. **Evidence-first AI (from the booklet):**
   - AI reads documents; it never decides. Every AI-extracted fact keeps its source page and confidence and stays _pending review_ until a person confirms it.
   - Never infer a missing value ("not found" instead of a guess). Never claim a stamp or document is genuine; reading a stamp's date is not verifying it.
   - Compliance status is computed by deterministic code from confirmed facts, not by AI.
   - Mandatory gaps are always shown on their own, never hidden inside an overall percentage.
   - Human overrides require a reason and are audit-logged.
5. **Client data:** real client documents contain ID numbers and bank details. They live only in `/fixtures/private/` (git-ignored) and are never committed, logged, or pasted into docs. Committed tests use synthetic data.

---

## 2. Tech Stack

- **App:** Next.js 16 (App Router) + React 19 + TypeScript strict, Tailwind CSS 4, Lucide icons. Server Components for reads, Server Actions for writes, Route Handlers only for uploads/AI where needed. Route protection lives in `proxy.ts` (Next 16 replaced `middleware.ts`).
- **Database, auth, files:** Supabase (Postgres with Row Level Security on every table, Supabase Auth, private Storage buckets). Tenancy is enforced by RLS via `organization_id`.
- **AI:** Anthropic API through **one server-only, provider-neutral AI gateway module** (`src/lib/ai/`); no other file imports a provider SDK. Default model `claude-opus-5-5` for reading tenders and company documents (native PDF and image input, structured output validated with Zod). Every call is logged (model, tokens, cost, latency). The API key belongs to the client's Anthropic account.
- **Testing:** Playwright for user journeys, Node's built-in `node --test` for pure logic, `npm run verify:rls` for tenant isolation.
- **Hosting:** Vercel + Supabase Cloud. The GitHub repo is linked to Vercel, so every push to `main` deploys. Runs on the developer's accounts until production moves to the client's accounts in E5.

---

## 3. Scope

Phase 1 is the first production module of one system, not a separate compliance app. The architecture sent to the client on 8 Oct 2026 (his approval is pending; see "Waiting on the client" in `docs/TASKS.md`) is in `docs/ARCHITECTURE.md`: system diagram, Phase 1 tables, table conventions, full platform entity map, roadmap, reuse map.

**Phase 1 (in scope, see `docs/TASKS.md`):**

- _Platform core, reused by every later module:_ companies, memberships and a permission matrix · append-only audit log · versioned, hashed documents · extracted facts with sources · domain events, jobs and a job runner · provider-neutral AI gateway with a run log · extensible Tender Digital Twin · requirement rule engine.
- _Functionality:_ company onboarding → Company DNA (document upload, AI reading of type, dates and certification stamps, validity) → tender/RFQ upload and AI reading with page references → requirements with the rules the tender states → evidence matching and cross-document conflict checks → compliance and gap report → human review · tender board and dashboard.

**Architecture rules:** the 11 rules in `docs/TASKS.md` ("Architecture rules") apply to every ticket: every business record belongs to a company; tenancy through memberships; permissions from one matrix; files only through documents and versions; AI output only through extracted facts; AI only through the gateway; background work only through jobs; audit entry and domain event for every material change; rules only from the tender; archive, don't delete; design for the full platform, build for Phase 1. A ticket that cannot follow one stops and asks.

**Later stages (do NOT build now; see the roadmap in `docs/ARCHITECTURE.md` §11):** bid / no-bid scoring · BOQ and pricing scenarios · MBD form filling · submission pack builder, approval gate and lock · subscription product for other companies · suppliers and RFQs · projects, logistics, finance · email/WhatsApp/e-tender portal integrations · authenticity verification of stamps and documents. Their tables are designed in the entity map but created only when their module is built.

If a request falls outside Phase 1, say so and suggest adding it to the roadmap rather than building it.

---

## 4. Documentation

Keep `/docs` current. Update in the same ticket that changes the code:

1. **`docs/ARCHITECTURE.md`:** system diagram, stack, constraints, data model (Mermaid ER diagram), RLS matrix, AI pipelines, decision log.
2. **`docs/TASKS.md`:** the task board (epics, tickets, handoff notes, waiting-on-client, completion log).
3. **`docs/API_AND_DATA_FLOW.md`:** server actions, route handlers, schemas, AI payload contracts.

Project skills and their sources are listed in `.claude/skills/README.md`.

---

## 5. Task Board and Sessions

- `docs/TASKS.md` holds five epics (E1–E5), one per client milestone, each with small tickets (`E1.1`, `E1.2`, …), a cut line and handoff notes.
- **Each epic runs in its own fresh Claude session.** Start by reading this file and the epic's _Session start_ block (plus the previous epic's _Handoff notes_). Before the session ends, write the epic's _Handoff notes_.
- Ticket statuses: `[TODO]`, `[IN PROGRESS]`, `[DONE]` (with SAST timestamp), `[CUT]`.

---

## 6. Per-Ticket Protocol

1. Wait for the user's go-ahead, then announce: `Starting E1.3: Auth`.
2. Work directly on `main` (no task branches; this machine is the only one pushing). **Every push to `main` auto-deploys to Vercel**, so nothing is pushed until step 5 is fully green.
3. Review the relevant files, schemas and skills (`supabase` + `supabase-postgres-best-practices` before any migration; never edit an applied migration).
4. Write clean, type-safe code, keeping to the ticket.
5. Verify: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, plus tests the ticket needs (`npm run test:e2e` once E1.2 lands, `npm run verify:rls` after schema changes).
6. Update docs and mark the ticket `[DONE]` in `docs/TASKS.md` with a completion-log row.
7. Commit only the files the ticket touched (no blind `git add .`), message `feat(scope): E1.3 - description`, then push `main`. Never force-push or rewrite `main` history.
8. Stop and report. Do not start the next ticket without a new go-ahead.

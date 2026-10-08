# Project: AI Procurement OS — Phase 1: Tender Compliance Checker

You are the lead engineer building **AI Procurement OS** for a South African client who submits government tenders and RFQs.
Phase 1 is a **tender compliance checker**: upload a tender and the company's documents, and the system shows what the tender requires, which documents meet it, and which are expired, expiring, certified too long ago, missing or in conflict. The client uses it for his own company first; selling it to other companies is a later phase.

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
- **AI:** Anthropic API through **one server-only AI gateway module** (`src/lib/ai/`). Default model `claude-opus-5-5` for reading tenders and company documents (native PDF and image input, structured output validated with Zod). Every call is logged (model, tokens, cost, latency). The API key belongs to the client's Anthropic account.
- **Testing:** Playwright for user journeys, Node's built-in `node --test` for pure logic, `npm run verify:rls` for tenant isolation.
- **Hosting:** Vercel + Supabase Cloud. The GitHub repo is linked to Vercel, so every push to `main` deploys. Runs on the developer's accounts until production moves to the client's accounts in E5.

---

## 3. Scope

**Phase 1 (in scope, see `docs/TASKS.md`):** logins and one company workspace with roles · audit log · company document vault with AI reading of type, dates and certification stamps · expiry, expiring-soon and stale-certification checks · tender PDF reading with page references · requirement-to-document matching and cross-document conflict checks · gap report · tender board and dashboard.

**Later phases (do NOT build now):** bid / no-bid scoring · BOQ and pricing scenarios · MBD form filling · submission pack builder, approval gate and lock · subscription product for other companies · suppliers and RFQs · projects, logistics, finance · email/WhatsApp/e-tender portal integrations · authenticity verification of stamps and documents.

If a request falls outside Phase 1, say so and suggest adding it to "Later phases" rather than building it.

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

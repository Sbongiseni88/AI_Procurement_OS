# Task Board — AI Procurement OS, Phase 1: Tender Compliance Checker

**Legend:** `[TODO]` · `[IN PROGRESS]` · `[DONE]` · `[CUT]` (dropped to protect the deadline, moved to Later)
**Deadline:** Phase 1 complete **Fri 13 Nov 2026**. Each epic below is one client milestone with a demo and sign-off.

## Working agreement

- **One epic per Claude session.** Start each epic in a fresh session. Begin with that epic's _Session start_ block; finish by writing its _Handoff notes_ so the next session can start cold.
- **One ticket at a time.** Wait for the go-ahead before each ticket. Work directly on `main`; no task branches. **Every push to `main` deploys to Vercel**, so push only when every check is green. Never force-push.
- **Done means:** `typecheck` + `lint` + `format:check` + `build` pass; new user journeys have a Playwright test; UI tickets pass a `web-design-guidelines` audit; docs updated; ticket marked `[DONE]` with timestamp; committed and pushed to `main`.
- **Keep it small.** Build only what the ticket says. No new library unless the ticket needs it. If a ticket grows past ~1 day, split it and ask.
- **UI:** minimal, work-management style, no "AI slop" (see CLAUDE.md §1.2). Use the `frontend-design` skill to build, `web-design-guidelines` to audit.
- **Database:** load `supabase` + `supabase-postgres-best-practices` skills before any migration or RLS change. Applied migrations are never edited; changes go in a new migration.
- **Client data:** real client documents live only in `/fixtures/private/` (git-ignored). Committed tests use synthetic data.
- **Cut line:** each epic marks which tickets get trimmed first if we fall behind. Expiry and certification checks are never cut; they are what the client is buying.

## Schedule

| Epic | Milestone                           | Dates          | Demo to client                                            |
| ---- | ----------------------------------- | -------------- | --------------------------------------------------------- |
| E0   | Repository foundation (done)        | 8 Sep          | —                                                         |
| E1   | Foundation and preview              | 9 – 15 Oct     | Live Vercel link: sign up, workspace, dashboard, board    |
| E2   | Company DNA vault and expiry checks | 16 – 26 Oct    | Upload his pack; AI reads dates and stamps; flags expired |
| E3   | Tender reading                      | 27 Oct – 2 Nov | Upload a tender; facts and returnables with page links    |
| E4   | Compliance check and gap report     | 3 – 9 Nov      | Requirement-by-requirement status and gap report          |
| E5   | Pilot and handover                  | 10 – 13 Nov    | Real tenders + his pack, live on his accounts             |

## Phase 1 scope

**In:** logins and one company workspace with roles · audit log · company document vault with AI reading of type, dates and certification stamps · expiry, expiring-soon and stale-certification checks · tender PDF reading with page references · requirement-to-document matching with statuses and cross-document conflict checks · gap report · tender board and dashboard.

**Out (Later phases):** bid / no-bid scoring · BOQ and pricing · MBD form filling · submission pack, approval gate and lock · selling to other companies (sign-up, billing, plans) · suppliers and RFQs · projects, logistics, finance · email/WhatsApp/portal integrations · proving a stamp is genuine (Phase 1 only reads and dates it; a person confirms).

---

## E0 · Repository foundation `[DONE]`

- `[DONE]` **T1.1** — Next.js 16 + TypeScript strict, Tailwind 4, ESLint, Prettier, Lucide. _(2026-09-08 10:07 SAST)_
- `[DONE]` **T1.2** — Supabase browser/server/admin clients, Zod-validated env. _(2026-09-08 15:15 SAST)_
- `[DONE]` **T1.3** — Migration: `organizations`, `profiles`, `app_role`, RLS, anti-escalation trigger, `verify:rls` script. _(2026-09-08 15:47 SAST)_ Applied to the hosted DB; merged into `main` (E1.1).

---

## E1 · Foundation and preview — 9 – 15 Oct

**Goal:** Thulani opens a Vercel link, creates an account, lands in his company workspace and sees the dashboard and an empty tender board in the final look.

**Session start:** read CLAUDE.md, this epic, ARCHITECTURE.md §4 (Next.js 16 constraints), §7 (Supabase clients), §8 (data model). Skills: `supabase`, `frontend-design`, `react-best-practices`.

- `[DONE]` **E1.1** — Housekeeping. Commit the pending docs/config changes on `feat/t1.3-schema-rls`, review the branch against `main`, merge it into `main` (last branch merge; from here on we work directly on `main`), push, and delete the branch. It carries the T1.3 migration, `verify:rls`, project skills, `.gitignore`, CLAUDE.md and this task board. _(2026-10-08 14:45 SAST)_ The branch was already fully contained in `main` (pending changes committed as `f8bd5f4`, `7a6e984`, `36f365c`), so no merge commit was needed; `main` pushed and the branch deleted locally and on the remote.
- `[DONE]` **E1.2** — Playwright harness: `@playwright/test`, `playwright.config.ts`, `tests/e2e/`, `test:e2e` script, one smoke test. Include the `server-only` leak probe (importing `admin.ts` from a Client Component must fail the build). _(2026-10-08 15:00 SAST)_
- `[DONE]` **E1.3** — Auth: sign up, log in, log out, password reset email. Route protection in `proxy.ts`. _(2026-10-08 15:18 SAST)_
  - Must apply the `no-store` cache headers `@supabase/ssr` passes as `setAll`'s second argument (T1.2 review finding); E2E asserts it.
  - Move `SUPABASE_PROJECT_ID` out of the runtime env schema (T1.2 cleanup).
  - Set `NEXT_PUBLIC_*` env vars in Vercel/CI before the first push that imports `publicEnv`.
- `[DONE]` **E1.4** — Onboarding: after first sign-up, create the organization and the first profile in one transaction. Use a `SECURITY DEFINER` function in a non-exposed schema with an `auth.uid()` check (per the `supabase` skill), callable only by a user with no profile yet. Keep the existing three roles for Phase 1. _(2026-10-08 15:30 SAST)_
- `[TODO]` **E1.5** — Audit log: append-only `audit_events` table (org, actor, action, entity, entity id, details JSON, timestamp). Insert through one server helper; RLS lets members read their own org's events; no update/delete for anyone. Log sign-up/onboarding.
- `[TODO]` **E1.6** — Design pass: write a short design plan (frontend-design), then define the token set in `globals.css` (the old prototype palette is already removed; only a neutral base remains). Status tokens for the Phase 1 set: compliant, expiring, expired, missing, conflict, needs verification, unable to verify. One `StatusPill` component. Update ARCHITECTURE.md §6.
- `[TODO]` **E1.7** — App shell: sidebar (Dashboard, Tenders, Company documents, Settings), header with company and user menu, responsive to phone width.
- `[TODO]` **E1.8** — Dashboard and tender board layout with real empty states (no fake numbers): "No tenders yet — upload your first tender" etc. Board columns follow the tender stages planned in E3.
- `[TODO]` **E1.9** — Deploy check: the GitHub repo is already linked to Vercel, so pushes to `main` deploy. Confirm the Vercel env vars are set, add the Vercel URL to Supabase auth Site URL / redirect URLs, smoke test sign-up and log-in on the live URL, then hand the link to the user to send. Update ARCHITECTURE.md §5 to current models (Claude Opus 5.5 for reading; matching in E4 is deterministic code, not AI).

**Cut line:** E1.8 board polish; password reset (E1.3) can slip to E5.

**Handoff notes:** _(write at end of session)_

---

## E2 · Company DNA vault and expiry checks — 16 – 26 Oct

**Goal:** Thulani uploads his company pack; the system reads each document's type, issuer, dates and certification stamp, flags expired, expiring and stale certified copies, and his team confirms what the AI read.

**Session start:** read CLAUDE.md, E1 handoff notes, this epic, ARCHITECTURE.md §5 and §8. Skills: `supabase-postgres-best-practices`, `supabase`, `frontend-design`, `claude-api`. Needs the Anthropic workspace invite (see Waiting).

- `[TODO]` **E2.1** — Schema: `company_documents` (category, file path, SHA-256, size, uploaded by, AI-read fields, review status, reviewer, reviewed at) and `ai_runs` (model, purpose, input/output tokens, cost, latency, outcome). Validity settings on `organizations`: certified-copy max age (default 90 days), statement max age (90), expiring-soon window (30). Private storage bucket with org-scoped paths and policies. Extend `verify:rls`.
- `[TODO]` **E2.2** — Upload: server action with type check (PDF, JPG, PNG), size limit, SHA-256 duplicate detection ("You already uploaded this file on …"), category picker. Audit event per upload.
- `[TODO]` **E2.3** — AI gateway: one server-only module (`src/lib/ai/`) wrapping the Anthropic SDK. Zod-validated structured output, timeouts, typed errors, writes an `ai_runs` row per call. No other file talks to Anthropic directly.
- `[TODO]` **E2.4** — Document reading: send each document to Claude; extract document type, issuer, entity name, registration number, address, issue date, expiry date (or validity stated in the document), certification stamps (date, issuing office, page) and a confidence per field. Rules: never infer a missing value (return "not found"), never judge authenticity. Results saved as _pending review_.
- `[TODO]` **E2.5** — Expiry engine: pure function, document + settings + today → `valid` / `expiring` / `expired` / `certification too old` / `date unknown`, with the reason. Unit tests with `node --test` (no new test library) using synthetic cases modelled on the sample pack (stamp 21 Jan 2026, statement 24 Nov 2025, affidavit valid 12 months).
- `[TODO]` **E2.6** — Review screen: AI-read fields beside the document preview; confirm, correct or reject each field. Corrections and confirmations are audit-logged. Only confirmed values feed the checks.
- `[TODO]` **E2.7** — Vault page: documents grouped by category with status pills, filter by status, "expiring in the next 30 days" list on the dashboard. Settings page to edit the three validity rules.
- `[TODO]` **E2.8** — Run Thulani's real pack from `/fixtures/private/` (after his POPIA consent); compare against the five findings in the quote. E2E for upload → review → status. Deploy and demo.

**Cut line:** dashboard "expiring" list (E2.7); field-by-field correction can become confirm/reject only (E2.6).

**Handoff notes:** _(write at end of session)_

---

## E3 · Tender reading — 27 Oct – 2 Nov

**Goal:** upload a tender or RFQ PDF and get its key facts and the list of returnable documents, each linked to the page it came from, ready for a person to confirm.

**Session start:** read CLAUDE.md, E2 handoff notes, this epic, ARCHITECTURE.md §5, §8, §9. Skills: `supabase-postgres-best-practices`, `claude-api`, `frontend-design`. Needs the Tshwane PDF (see Waiting).

- `[TODO]` **E3.1** — Schema: `tenders` (reference, issuer, title, closing date/time, briefing date and whether compulsory, scoring 80/20 or 90/10, stage), `tender_documents` (file, SHA-256), `tender_requirements` (text, mandatory flag, mapped document category, validity rule in days if stated, source page, source quote, confidence, review status, override status and reason). RLS + `verify:rls`.
- `[TODO]` **E3.2** — Upload tender PDF → create tender in stage "Reading". Original file stored unchanged.
- `[TODO]` **E3.3** — Extraction through the AI gateway: key facts + returnable documents + validity rules ("certified within 3 months", "statement not older than 3 months"), each with page number and quote. Zod schema; "not found" instead of guesses. Generic for any tender; no Tshwane-specific code.
- `[TODO]` **E3.4** — Requirement mapping: deterministic lookup from common wording (CSD report, tax compliance PIN, B-BBEE, CIPC, municipal account…) to document categories, with AI suggestion only where the lookup has no match. A person can change the mapping.
- `[TODO]` **E3.5** — Tender page: facts with page references, requirement list, confirm/edit, stage shown on a simple stage tracker.
- `[TODO]` **E3.6** — Tender board and dashboard show real tenders: board by stage, list sorted by closing date, "closing in 7 days" count.
- `[TODO]` **E3.7** — Run the Tshwane tender and both RFQs; record misses in handoff notes and fix the prompt/schema. E2E for upload → facts visible. Deploy and demo.

**Cut line:** AI suggestion in E3.4 (manual mapping only); stage tracker visuals (E3.5).

**Handoff notes:** _(write at end of session)_

---

## E4 · Compliance check and gap report — 3 – 9 Nov

**Goal:** for any tender, every requirement shows whether the company's confirmed documents meet it, why not if they don't, and mandatory gaps are listed first.

**Session start:** read CLAUDE.md, E3 handoff notes, this epic, ARCHITECTURE.md §8 and §9. Skills: `supabase-postgres-best-practices`, `frontend-design`, `web-design-guidelines`.

- `[TODO]` **E4.1** — Matching engine: pure, deterministic code (no AI). Requirement category → confirmed documents via a `Map`; apply the tender's validity rule, else the company default. Statuses: compliant, expiring, expired, missing, conflict, needs verification, unable to verify, each with a plain-language reason. Unit tests.
- `[TODO]` **E4.2** — Cross-document checks: company name, registration number and address compared across confirmed documents (normalised: case, punctuation, "(Pty) Ltd"). Mismatches become conflict findings naming both documents. Unit tests from the sample pack's address and B-BBEE date conflicts.
- `[TODO]` **E4.3** — Compliance page: mandatory gaps first, then all requirements with pills, the matched document, the tender page reference and the reason. Person can mark "not applicable" or override with a required reason (audit-logged). Results computed on load; no results table in Phase 1.
- `[TODO]` **E4.4** — Gap report: a print-friendly page (browser print to PDF) listing what is missing, expired or in conflict and what to do about each. No custom PDF library.
- `[TODO]` **E4.5** — Tender moves to stage "Compliance checked" when every mandatory requirement is resolved or overridden. E2E for upload pack + tender → gap report. Deploy and demo.

**Cut line:** address comparison in E4.2 (keep name and registration number); auto stage change (E4.5).

**Handoff notes:** _(write at end of session)_

---

## E5 · Pilot and handover — 10 – 13 Nov

**Goal:** Phase 1 runs on real tenders and Thulani's real pack, live on his own accounts, with documentation he and a future developer can follow.

**Session start:** read CLAUDE.md, E4 handoff notes, this epic, all of ARCHITECTURE.md. Skills: `supabase`, `web-design-guidelines`.

- `[TODO]` **E5.1** — Pilot: run the Tshwane tender, both RFQs and his pack end to end. Log every wrong or missed finding in `docs/PILOT.md`.
- `[TODO]` **E5.2** — Fix pilot findings (timeboxed to one day; the rest becomes a list for him).
- `[TODO]` **E5.3** — Security pass: `verify:rls` covers every table; E2E proves one company cannot see another's data; `supabase db advisors` clean; no secrets in the client bundle; storage policies checked.
- `[TODO]` **E5.4** — Go live on his accounts: Vercel and Supabase under his ownership (transfer or fresh project + migrations), his Anthropic key, auth redirect URLs, spend limit confirmed.
- `[TODO]` **E5.5** — Handover docs: a two-page user guide, an admin runbook (env vars, deploys, migrations, rotating keys), ARCHITECTURE.md and API_AND_DATA_FLOW.md brought up to date.
- `[TODO]` **E5.6** — Final sign-off checklist with the client; start of the 30-day bug-fix period recorded.

**Cut line:** user guide shortened to one page (E5.5).

**Handoff notes:** _(write at end of session)_

---

## Waiting on the client

| Item                                                          | Needed by | Status                                     |
| ------------------------------------------------------------- | --------- | ------------------------------------------ |
| Signed quote / first 50% for E1                               | E1        | Quote sent                                 |
| Anthropic account with a developer invite to "Procurement OS" | E2.3      | Steps sent                                 |
| Written POPIA consent for AI processing of company documents  | E2.8      | Not requested yet                          |
| His rules for certified-copy and statement age                | E2.5      | Defaulting to 90 days until he answers     |
| City of Tshwane Q02-O1-2026-27 tender PDF (32 pages)          | E3.7      | Not received; the two RFQ PDFs are in hand |
| Vercel and Supabase accounts in his name                      | E5.4      | Not requested yet                          |

## Later phases (not in Phase 1)

Bid / no-bid engine · BOQ and pricing scenarios (VAT, markup vs margin) · MBD form intelligence · submission pack builder, human approval gate and lock · subscription product for other companies · supplier and RFQ engine · company brain / search · projects, logistics, finance.

## Completion log

| Task | Completed             | Branch                      | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | --------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1.1 | 2026-09-08 10:07 SAST | `feat/t1.1-project-init`    | `typecheck` ✅ · `lint` ✅ · `build` ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| T1.2 | 2026-09-08 15:15 SAST | `feat/t1.2-supabase-client` | `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · live client smoke test ✅ · env guards ✅ · `server-only` leak probe ✅                                                                                                                                                                                                                                                                                                                                                                   |
| T1.3 | 2026-09-08 15:47 SAST | `feat/t1.3-schema-rls`      | `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · migration applied to hosted DB ✅ · `verify:rls` 12/12 ✅ · generated types enforce schema ✅                                                                                                                                                                                                                                                                                                                                             |
| E1.1 | 2026-10-08 14:45 SAST | `main`                      | `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `verify:rls` 12/12 on hosted DB ✅ · branch already contained in `main`; deleted local + remote                                                                                                                                                                                                                                                                                                                                           |
| E1.2 | 2026-10-08 15:00 SAST | `main`                      | `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:e2e` 2/2 ✅ (smoke + `server-only` leak probe; build fails as expected, tree left clean, `typecheck` still passes afterwards)                                                                                                                                                                                                                                                                                                       |
| E1.3 | 2026-10-08 15:18 SAST | `main`                      | `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:unit` 7/7 ✅ · `test:e2e` 13/13 ✅ against `next start` (log in/out, wrong password, guard redirects, open-redirect refusals, reset via `generateLink`, sign-up confirmation link, every `sb-` cookie response `no-store`) · screenshots 1280/390 ✅ · `web-design-guidelines` audit fixed ✅ · code review: open redirect and reset-without-recovery fixed ✅                                                                      |
| E1.4 | 2026-10-08 15:30 SAST | `main`                      | 2 migrations tried locally first, then `db:push` to hosted ✅ · `db advisors` clean ✅ · `verify:rls` 20/20 on hosted ✅ (no second onboarding, no second or joined org, whitespace names, anon, private schema unreachable) · `db:types` ✅ · `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:unit` 7/7 ✅ · `test:e2e` 16/16 ✅ (sign up → confirm → onboarding → workspace) · screenshots 1280/390 ✅ · audit ✅ · code review: log-out on onboarding, whitespace names fixed ✅ |

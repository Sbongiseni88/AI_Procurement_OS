# Task Board — AI Procurement OS, Phase 1 (first production module)

**Legend:** `[TODO]` · `[IN PROGRESS]` · `[DONE]` · `[CUT]` (dropped to protect the deadline, moved to Later)
**Deadline:** Phase 1 complete **Wed 18 Nov 2026**. Each epic below is one client milestone with a demo and sign-off.

Phase 1 is **not a standalone compliance app**. It is the first production module of the full AI Procurement OS, built on a platform core (tenancy, memberships, permissions, audit, versioned documents, events and jobs, AI gateway) that every later module reuses. The client-approved architecture and roadmap is the source of truth for design decisions (`AI_Procurement_OS_Architecture_and_Roadmap.pdf`, 8 Oct 2026; written into ARCHITECTURE.md in E1.5.1).

## Working agreement

- **One epic per Claude session.** Start each epic in a fresh session. Begin with that epic's _Session start_ block; finish by writing its _Handoff notes_ so the next session can start cold.
- **One ticket at a time.** Wait for the go-ahead before each ticket. Work directly on `main`; no task branches. **Every push to `main` deploys to Vercel**, so push only when every check is green. Never force-push.
- **Done means:** `typecheck` + `lint` + `format:check` + `build` pass; `test:unit` and `test:e2e` pass; `verify:rls` covers every new table, function and storage policy; new user journeys have a Playwright test; UI tickets pass a `web-design-guidelines` audit; docs updated; ticket marked `[DONE]` with timestamp; committed and pushed to `main`.
- **Keep it small.** Build only what the ticket says. No new library unless the ticket needs it. If a ticket grows past ~1 day, split it and ask.
- **UI:** minimal, work-management style, no "AI slop" (see CLAUDE.md §1.2). Use the `frontend-design` skill to build, `web-design-guidelines` to audit.
- **Database:** load `supabase` + `supabase-postgres-best-practices` skills before any migration or RLS change. Applied migrations are never edited; changes go in a new migration. Try migrations on local Supabase first (see E1 handoff notes), then `db:push`.
- **AI in tests:** E2E and unit tests use the gateway's fake provider and never spend money. Only tickets that say "live run" call Anthropic.
- **Client data:** real client documents live only in `/fixtures/private/` (git-ignored). Committed tests use synthetic data.
- **Milestone tags:** when the client signs off a milestone, tag `main` with an annotated tag (`m1`, `m1.5`, `m2` … `m5`) and push the tag.
- **Cut line:** each epic marks which tickets get trimmed first if we fall behind. Platform-core conventions and expiry/certification reading are never cut.

## Architecture rules (apply to every ticket)

From the client's requirements of 8 Oct 2026. A ticket that cannot follow one of these stops and asks.

1. **Every business record belongs to a company.** Required `organization_id` + the standard RLS policy on every business table, now and in future modules.
2. **Tenancy through memberships.** A person can belong to several companies (`memberships`); access follows the active membership. Never key access on a single company stored on the user.
3. **Permissions from one matrix.** Server actions check `can(role, action)` from the single permission matrix; RLS enforces tenancy and the sensitive writes.
4. **Files only through `documents` + `document_versions`.** SHA-256 hash, immutable versions, originals never overwritten or deleted.
5. **AI output only through `extracted_facts`.** Every fact keeps document version, page, quote, confidence, producing AI run and review status. Only confirmed facts feed rules.
6. **AI only through the AI gateway** (`src/lib/ai/`), provider-neutral, every call logged in `ai_runs`. No other file imports a provider SDK.
7. **Background work only through `jobs`.** Anything slow (AI reading) is a job with retries; future agents are new job types.
8. **Every material change** writes an `audit_events` entry and a `domain_events` entry.
9. **Rules come from the tender.** No default certification period or document-age limit anywhere. A rule exists only if the tender states it, stored with its page and quote. If the tender is silent, no limit is applied.
10. **Archive, don't delete.** Business records and evidence history are archived, never hard-deleted.
11. **Design for the full platform, build for Phase 1.** Future-module tables (suppliers, BOQs, submissions, projects…) are designed in ARCHITECTURE.md but created only when their module is built.

## Schedule

| Epic | Milestone                       | Dates          | Demo to client                                                                                |
| ---- | ------------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| E0   | Repository foundation (done)    | 8 Sep          | —                                                                                             |
| E1   | Foundation and preview          | Done 8 Oct     | Live link: sign up, workspace, dashboard, board (after E1.9)                                  |
| E1.5 | Platform foundation             | 12 – 16 Oct    | Architecture in the repo; memberships, versioned documents, jobs, AI gateway working in tests |
| E2   | Company DNA and evidence        | 19 – 28 Oct    | Upload his pack; AI reads dates and stamps; review; validity status                           |
| E3   | Tender reading and Digital Twin | 29 Oct – 4 Nov | Upload a tender/RFQ; facts, returnables and stated rules with page links                      |
| E4   | Compliance and gap report       | 5 – 11 Nov     | Requirement-by-requirement status, human decisions, gap report                                |
| E5   | Pilot and handover              | 12 – 18 Nov    | Real tenders + his pack, live on his accounts                                                 |

## Phase 1 scope

**Functionality:** Company onboarding → Company DNA → Tender/RFQ upload → AI tender reading → Requirements → Evidence matching → Compliance → Gap report → Human review. Plus the dashboard and tender board.

**Platform core built now (reused by every later module):** companies, memberships and permission matrix · append-only audit log · versioned, hashed documents · extracted facts with sources · domain events, jobs and job runner · provider-neutral AI gateway with run log · extensible Tender Digital Twin · requirement rule engine.

**Not in Phase 1** (see Roadmap): everything in V1, V1.5/V2 and Later, including proving a stamp or document is genuine (Phase 1 reads and dates stamps; a person confirms).

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
- `[DONE]` **E1.5** — Audit log: append-only `audit_events` table (org, actor, action, entity, entity id, details JSON, timestamp). Insert through one server helper; RLS lets members read their own org's events; no update/delete for anyone. Log sign-up/onboarding. _(2026-10-08 15:37 SAST)_
- `[DONE]` **E1.6** — Design pass: write a short design plan (frontend-design), then define the token set in `globals.css` (the old prototype palette is already removed; only a neutral base remains). Status tokens for the Phase 1 set: compliant, expiring, expired, missing, conflict, needs verification, unable to verify. One `StatusPill` component. Update ARCHITECTURE.md §6. _(2026-10-08 15:41 SAST)_
- `[DONE]` **E1.7** — App shell: sidebar (Dashboard, Tenders, Company documents, Settings), header with company and user menu, responsive to phone width. _(2026-10-08 15:47 SAST)_
- `[DONE]` **E1.8** — Dashboard and tender board layout with real empty states (no fake numbers): "No tenders yet — upload your first tender" etc. Board columns follow the tender stages planned in E3. _(2026-10-08 15:51 SAST)_
- `[DONE]` **E1.9** — Deploy check: the GitHub repo is already linked to Vercel, so pushes to `main` deploy. Confirm the Vercel env vars are set, add the Vercel URL to Supabase auth Site URL / redirect URLs, smoke test sign-up and log-in on the live URL, then hand the link to the user to send. Update ARCHITECTURE.md §5 to current models (Claude Opus 5.5 for reading; matching in E4 is deterministic code, not AI). _(2026-10-08 17:18 SAST)_ Vercel env vars set by the user (exact `NEXT_PUBLIC_` names required); live site deployed; smoke and auth E2E pass against the live URL.

**Cut line:** E1.8 board polish; password reset (E1.3) can slip to E5.

**Handoff notes** _(written 2026-10-08 15:53 SAST, end of the E1 session)_

**Built (E1.1–E1.9 done; steps 2–3 below are still yours).** Auth (sign up, log in, log out,
password reset) with `proxy.ts` route protection; onboarding (`complete_onboarding` →
`private.create_workspace`) creating the company and its first member as executive approver;
append-only `audit_events` with one server write helper, onboarding logged; the design
tokens and `StatusPill` (only problems get colour, no green); the app shell (sidebar,
header, account menu, phone drawer); dashboard and tender board with real empty states.
Three new migrations are applied to the hosted dev project. `verify:rls` is 27/27,
`test:e2e` 23/23, `test:unit` 7/7.

**What you need to do by hand, in order:**

1. ✅ _Done by the user. Keep these exact names: Vercel's warning about `NEXT_PUBLIC_` keys is expected for the URL and the publishable key, and those two must not be Sensitive._ **Vercel → Project → Settings → Environment Variables** (Production and Preview), then
   redeploy the latest `main` (Deployments → ⋯ → Redeploy). Every deploy since `403583b`
   (E1.3) failed with `Invalid public environment configuration: NEXT_PUBLIC_SUPABASE_URL`
   (reproduced locally by building without `.env.local`). Vercel kept serving the E1.2
   deploy, so the site still loads, but it is the old placeholder.
   - `NEXT_PUBLIC_SUPABASE_URL` = the value in your `.env.local`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the `sb_publishable_…` value in `.env.local`
   - `SUPABASE_SECRET_KEY` = the `sb_secret_…` value, marked **Sensitive**. Needed at
     runtime by the audit helper. Never give it a `NEXT_PUBLIC_` prefix.
   - (`SUPABASE_PROJECT_ID` is no longer read by the app.)
2. **Supabase dashboard → Authentication → URL Configuration** (I can't read or change it
   without a dashboard login; `supabase/config.toml` only covers local):
   - Site URL: `https://ai-procurement-os.vercel.app`
   - Redirect URLs: `https://ai-procurement-os.vercel.app/**` and `http://localhost:3000/**`
3. **Decide how the client's sign-up email will reach him.** The hosted project has
   "Confirm email" on, and Supabase's built-in mailer only delivers to members of your
   Supabase team and only a few emails an hour, so his confirmation (and any password
   reset) email will most likely never arrive. Options: (a) add custom SMTP (Supabase →
   Authentication → Emails → SMTP; a provider account is yours to create), (b) turn off
   "Confirm email" for the preview, or (c) invite him to the Supabase team for the demo.
   I changed no auth settings.
   _Optional, any device:_ change the "Confirm signup" and "Reset password" templates to
   link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/` (and
   `type=recovery&next=/reset-password`). The default links use PKCE and only work in the
   browser that asked for the email; `/auth/callback` already accepts both.
4. ✅ _Done: 11/11 against the live URL._ **After steps 1–2, run the live smoke test** (creates and deletes its own user):
   `PLAYWRIGHT_BASE_URL=https://ai-procurement-os.vercel.app npx playwright test smoke`,
   then mark E1.9 `[DONE]` and send the link.
5. Your Vercel CLI login on this machine has expired (`vercel login` if you want the CLI).

**Decisions and gotchas.**

- E2E runs against `next build && next start`, not `next dev`: dev mode rewrites
  Cache-Control on every response, which hid the `no-store` headers the auth tests assert.
  In production, Next already marks Server Action responses `no-store`; the proxy applies
  `@supabase/ssr`'s headers to session refreshes and redirects; `/auth/callback` sets them
  itself.
- Tests never wait for email: users are made with the admin API (`createUser`,
  `generateLink`) and deleted in fixtures, pass or fail. They run against the hosted dev
  project; the run leaves 0 users, organizations and audit events behind (checked).
- Migrations were tried on a local Supabase first (Docker; `npx supabase start -x
realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,studio,postgres-meta`,
  then `npx supabase migration up --local`, and `verify:rls` with the local URL/keys exported
  from `npx supabase status -o env`), then pushed. Worth keeping: applied migrations can't
  be edited. The local stack has been stopped.
- Password reset only works from a fresh (15 min) email-link session; a password session
  cannot set a new password without the old one (account takeover guard).
- `next=` redirects are resolved by the URL parser and must stay same-origin (a tab before
  a second slash was an open redirect, caught in review).
- Audit events: no user INSERT grant (they could forge entries); written by the service
  role through `recordAuditEvent`, which derives organization and actor itself. Not one
  transaction with the workspace insert: a DB failure between them loses that one event
  (logged). Move the insert into `private.create_workspace` if that ever matters.
- Tender stages for the board (`reading`, `review`, `checking`, `checked`) are in
  `src/lib/tenders/stages.ts`; E3.1's enum should reuse them. Status values for E2.5/E4.1
  are in `src/lib/compliance/statuses.ts`.
- Claude Opus 5.5 facts for E2.3 are in ARCHITECTURE §5 (effort default `medium`, no
  forced `tool_choice`, structured outputs).
- One test-setup call failed once with Supabase's `JWT issued at future` (clock skew); it
  passed on re-run and did not recur.
- Repo notes: the `.claude/` ignore question resolved itself (you committed the skills in
  `a8fd7cd`). An empty, untracked `src/app/api/` folder exists; I left it alone. Prettier
  now reads `globals.css` (`tailwindStylesheet`), so class order changed in a few files.

**Cut or stashed:** nothing cut, no stashes.

**Live URL status:** https://ai-procurement-os.vercel.app is live on the E1 build (2026-10-08 17:18 SAST): `/`
redirects to `/login`, and the smoke and auth tests pass against it. One real account and
company (not test data), created by the user after the redeploy, exist in the dev project.

---

## E1.5 · Platform foundation — 12 – 16 Oct

**Goal:** the shared platform core the client asked for is in place before any module uses it: the agreed architecture written into the repo, memberships and a permission matrix, versioned hashed documents, domain events with a job runner, and a provider-neutral AI gateway.

**Started 8 Oct 2026**, ahead of its 12 – 16 Oct slot; the client's approval of the architecture document and Milestone 1.5 is still pending (see Waiting on the client).

**Session start:** read CLAUDE.md, E1 handoff notes, this epic, the Architecture rules above, ARCHITECTURE.md §5, §7, §8, and the client's architecture PDF if provided. Skills: `supabase`, `supabase-postgres-best-practices`, `react-best-practices`, `claude-api`.

- `[DONE]` **E1.5.1** — Architecture in the repo: write the approved architecture into ARCHITECTURE.md (system diagram, Phase 1 data model and ER diagram, table conventions, full platform entity map, roadmap stages, reuse map) and add decision-log entries. Update CLAUDE.md §3 scope wording to "first production module" and add the Architecture rules. Docs only. _(2026-10-08 17:36 SAST)_ Written from the PDF sent to the client on 8 Oct (approval pending, so CLAUDE.md says "sent", not "approved"). ARCHITECTURE.md keeps §1–§9 numbering; new §10 entity map, §11 roadmap, §12 reuse map, §13 decision log (#26–#34). Stale ticket numbers fixed across the docs.
- `[DONE]` **E1.5.2** — Memberships: `memberships` (organization, user, role, status, invited by, timestamps; unique per company and person). Backfill from `profiles`; move `current_organization_id()` / `current_user_role()` and every policy to the active membership; onboarding creates a membership. Drop `profiles.organization_id` and `profiles.role` in a follow-up migration once nothing reads them. `verify:rls`: a person in two companies sees only the active one, cannot add themselves to a company, cannot raise their own role. _(2026-10-08 17:58 SAST)_ Four steps: three migrations (additive + backfill; helpers and policies; drop columns) and the app switch to memberships. Active company: `profiles.active_organization_id` is only a preference, validated against active memberships inside `private.current_organization_id()`; switching through `rpc/switch_organization`; no switcher UI until invitations exist. Helpers moved to `private` (clears 4 advisor warnings). Incidents: step 1 made the deployed app's profile→company embed ambiguous (hotfixed); step 4 was pushed together with step 2 before the step 3 code deployed, so signed-in pages failed for a few minutes (see Handoff notes).
- `[DONE]` **E1.5.3** — Permission matrix: one module (`src/lib/auth/permissions.ts`) mapping roles to actions (documents upload/review, tenders create/review, requirements decide, members manage, settings edit, audit view). Add a read-only `viewer` role. Server actions call `can()`; unit tests for the matrix. Document how booklet roles are added later. _(2026-10-08 18:07 SAST)_ `src/lib/auth/permissions.ts` (roles, labels, 8 actions, `can`, `rolesThatCan`) and `requirePermission` in `membership.ts`. `viewer` added by migration. No existing action needed `can()`: there is no settings action (the settings page is read-only) and onboarding runs before a role exists; E1.5.4's upload helper is the first caller. A unit test keeps `settings.edit` in sync with the `organizations` update policy; the build fails if the role list and the enum drift.
- `[DONE]` **E1.5.4** — Documents and versions: `documents` (company, kind company/tender, title, category, current version, archived at) and `document_versions` (company, document, version number, storage path, SHA-256, size, MIME type, original file name, uploaded by, uploaded at). Versions immutable (no update/delete for anyone). Private storage bucket with company-scoped paths and storage policies. One server helper that hashes, detects duplicates within the company, stores the file and creates the version. `verify:rls` covers cross-company file access. _(2026-10-08 18:27 SAST)_ Helper `uploadDocumentFile` (server) over `storeDocumentVersion` (core, testable); one service-role function `add_document_version` records document, version, current pointer and the `document.uploaded` audit entry in one transaction. File type sniffed from the bytes. No UI (E2.2). Vercel's 4.5 MB request limit noted for E2.2.
- `[DONE]` **E1.5.5** — Domain events and jobs: `domain_events` (company, type, entity, payload, actor, time) and `jobs` (company, type, status, attempts, max attempts, run after, payload, result, error, locked at, linked entity). One helper records an event and optionally enqueues a job. Job runner: a protected route that claims jobs safely (`FOR UPDATE SKIP LOCKED` via a database function), dispatches by type to registered handlers, retries with backoff. Kick the runner right after enqueue (Next.js `after()`), with a Vercel Cron as safety net (Hobby plan cron runs at most daily; note the plan limit in the docs). A `ping` job type for tests. _(2026-10-08 18:42 SAST)_ `record_domain_event` (event + optional job, one transaction) and `claim_jobs` (SKIP LOCKED, stale reclaim) are service-role functions; runner core is pure and unit-tested; `GET /api/jobs/run` needs `Authorization: Bearer $CRON_SECRET` and refuses all requests until you add the secret in Vercel; daily cron 01:00 UTC; `recordDomainEvent` kicks the runner with `after()`. Uploads and onboarding now record domain events. No production path queues a job yet, so the `after()` kick has no E2E until E2.2.
- `[DONE]` **E1.5.6** — AI gateway: `src/lib/ai/` with a provider-neutral interface (task, input files, Zod output schema → validated result), an Anthropic adapter (`claude-opus-5-5`), task-to-model routing in one config, timeouts and typed errors, and `ai_runs` (company, job, provider, model, task, tokens, estimated cost, latency, outcome, error). A fake provider for tests. One live run (skipped when no key) once the client's Anthropic invite arrives. _(2026-10-08 18:59 SAST)_ `src/lib/ai/`: provider-neutral `AiProvider`, task routing in `config.ts` (four tasks, all `claude-opus-5-5`), Zod-validated output, one typed `AiError` (code + retryable), timeouts that abort, `ai_runs` logging for every outcome, refusal fallbacks (`fallbacks: "default"`), fake provider for all tests, offline adapter tests with a fake `fetch`. `@anthropic-ai/sdk` 0.132.1 pinned; ESLint confines it to the adapter. `ANTHROPIC_API_KEY` optional. **Live run skipped: no key yet** (`npm run test:ai-live` once the client's invite arrives).
- `[DONE]` **E1.5.7** — Wrap-up: ER diagram and API_AND_DATA_FLOW.md match what was built; full suite green; demo notes for the client (what exists now and how later modules plug in). _(2026-10-08 19:07 SAST)_ ER diagram redrawn from the hosted schema's foreign keys (all nine built tables); API register checked against every action, route, helper and RPC in the code. A fresh clone of `main` failed `typecheck` (Next's route types are generated), so `typecheck` now runs `next typegen` first. Demo notes in the Handoff notes.

**Cut line:** Vercel Cron safety net (E1.5.5) can wait if the after-enqueue kick works; `viewer` role (E1.5.3).

**Handoff notes** _(written 2026-10-08, end of the E1.5 session)_

**Built (E1.5.1–E1.5.7 done; nothing cut).** The architecture sent to the client is in
ARCHITECTURE.md (§1 system, §8 Phase 1 tables, conventions and the complete built ER diagram,
§10 entity map, §11 roadmap, §12 reuse map, decisions #26–#50). Platform core:
memberships with an active company and `switch_organization`; one permission matrix with a
read-only `viewer` role; documents with immutable, SHA-256-hashed versions in a private
bucket; domain events, jobs and a job runner (`GET /api/jobs/run`, daily cron, `after()`
kick); a provider-neutral AI gateway with `ai_runs`. Nine migrations, all applied to the
hosted dev project. `verify:rls` 59/59, `test:unit` 50/50, `test:e2e` 37/37, also on a fresh
clone of `main`. No UI changes apart from a "No active company" message on onboarding.

**What you need to do by hand:**

1. **Add `CRON_SECRET` in Vercel** (Project → Settings → Environment Variables, Production
   and Preview, mark Sensitive): at least 16 random characters, e.g. the output of
   `openssl rand -hex 32`. Also put it in `.env.local` if you want to call the runner
   yourself. Redeploy, then check:
   `curl -H "Authorization: Bearer <secret>" https://ai-procurement-os.vercel.app/api/jobs/run`
   should answer `{"succeeded":0,"retrying":0,"failed":0}` (today it answers 503 by design).
   Vercel then calls it daily at 01:00 UTC.
2. **Add `ANTHROPIC_API_KEY` once the client's Anthropic invite arrives**: in `.env.local`
   and in Vercel (Sensitive, never `NEXT_PUBLIC_`). Set a monthly spend limit in the
   Anthropic console first. Then run `npm run test:ai-live` (one tiny Claude Opus 5.5 call,
   well under US$0.05) and note the result in this epic's completion log.
3. **Decide on upgrading Next.js 16.3.4 → 16.3.8** (patch release). `npm audit` reports
   seven critical advisories fixed there (RCE in `next/og`, SSRF in image optimisation,
   cache poisoning, …). Most concern features this app does not use, but the site is
   public. Recommended as a small chore before E2; not done here because it was not an
   E1.5 dependency. `sharp` and `source-map-js` (dev/build) also have fixes available.
4. **Supabase → Authentication → Password security: leaked-password protection** is off
   (the one remaining database-advisor warning). It may need a paid plan.
5. Still open from E1: Supabase auth Site URL and redirect URLs (E1 step 2) and the email
   delivery decision (E1 step 3), if not done yet.
6. No action, for awareness: from **30 Oct 2026** Supabase stops granting new tables to the
   API automatically. Every migration here already grants explicitly, including to
   `service_role`; keep doing that.

**Decisions and gotchas.**

- **Active company.** `profiles.active_organization_id` is a preference only.
  `private.current_organization_id()` picks the person's chosen company if it is among their
  **active** memberships, else their oldest active one, else nothing (fail closed). A forged
  or stale value grants nothing (`verify:rls` writes one as the service role; a mutation
  test proved the check bites). Only the active company's `organizations` row is visible, so
  `getMembership()` gets exactly one row through RLS. Co-members cannot read a person's
  selection (column grants: `select *` on `profiles` fails for users). No switcher UI: nobody
  has a second membership until invitations exist. A person whose memberships are all
  removed sees "No active company" on onboarding; onboarding never creates a second first
  workspace.
- **Job runner limits (Vercel Hobby).** Cron runs once a day (within the hour). A function
  runs at most 300 s; one drain has a 200 s budget and claims only as many jobs as could
  all finish at their longest timeout. **One handler with a timeout over 200 s stops the runner
  claiming any job at all** (claims are sized by the longest handler timeout): keep every
  handler's timeout under 200 s and above its AI task's timeout (AI
  reading tasks are set to 170 s). A retry due in more than 60 s waits for the next enqueue
  or the daily cron; E2 should kick the runner when someone opens a page with pending jobs.
  Jobs are global: any kick runs every company's due jobs.
- **Writes that matter happen in the database.** `add_document_version` records the version,
  current pointer, `document.uploaded` audit entry and domain event in one transaction, and
  re-checks duplicates under an advisory lock (`PT409`). TypeScript-side writes use
  `recordAuditEvent` / `recordDomainEvent`.
- **Uploads in E2.2.** Vercel accepts request bodies up to 4.5 MB, so a Server Action can pass
  only small files to `uploadDocumentFile`; larger scans need a direct upload to a narrowly
  scoped staging path that the server then hashes and records. Storage files do not cascade
  when a company is deleted (tests remove their own).
- **The `after()` kick has no E2E yet**: no production path queues a job until E2.2's upload.
  The runner route and the runner logic are tested.
- **Incidents, both fixed within minutes.** (1) Step 1 of memberships gave `profiles` a
  second foreign key to `organizations`, which made the deployed app's embed ambiguous
  (PGRST201) for signed-in pages until a hotfix named the key. (2) I created the step 4
  migration file before pushing step 2; `supabase db push` pushes **every** pending file, so
  the column drop reached the hosted database before the code that stopped reading it was
  deployed, and signed-in pages failed until that code deployed (a few minutes). Rules
  since: create a migration file only when the previous one is pushed, read the dry-run list
  every time, and keep schema changes deploy-compatible with the code that is live.
- **This machine's network drops** (`net::ERR_NETWORK_CHANGED`, `fetch failed`, pooler
  timeouts): re-run, never weaken a test. Never run two Playwright runs at once (they share
  `test-results/`), and avoid E2E while other network-heavy jobs run. Supabase's
  `JWT issued at future` appeared three times in fixture setup; it passes on re-run.
- **Local Supabase now includes Storage**: `npx supabase start -x
realtime,imgproxy,edge-runtime,logflare,vector,supavisor,studio,postgres-meta`. The DB
  container is `supabase_db_xrrbrwcnlhtcceaedazp` (psql through `docker exec`). `supabase gen
types --local` needs the postgres-meta image (its pull stalled); generate types with
  `npm run db:types` after the hosted push instead. `npx supabase db advisors` checks
  **local** by default; add `--linked` for hosted.
- **Unit tests run TypeScript through Node's type stripping**: modules they load use `.ts`
  extensions on relative imports, `import type` for type-only imports, and no constructor
  parameter properties.
- `npm run typecheck` now runs `next typegen` first: a fresh clone could not typecheck
  (route types are generated), found by the clean-checkout run.
- New npm scripts: `test:ai-live` (opt-in). New env vars, both optional: `CRON_SECRET`,
  `ANTHROPIC_API_KEY` (see `.env.local.example`).

**Cut, blocked or stashed:** nothing cut (the `viewer` role and the cron safety net, both on
the cut line, were built); the live AI run is skipped until the key exists; no stashes. The
client's approval of the architecture and Milestone 1.5 is still pending; the work was done
ahead of it.

**Demo notes for the client** (Milestone 1.5, platform foundation):

- _What exists now._ The shared foundation every module will use, in the code and tested
  automatically on every change:
  - **Companies and people.** One login can belong to several companies and always works in
    one at a time; access follows that company. Nobody can add themselves to a company or
    raise their own role; 59 automatic security checks prove one company cannot see or
    change another's data.
  - **Roles from one table.** Executive approver, bid manager, pricing specialist, and a new
    read-only viewer. New roles from the booklet are added to that table, not to screens.
  - **Documents.** Every file is stored as a document with versions. Each version is
    fingerprinted (SHA-256), never overwritten or deleted, kept private to the company, and
    an identical file uploaded twice is recognised.
  - **History.** Every important change writes an audit entry and a business event.
  - **Background work.** Slow work such as AI reading runs as jobs that retry automatically
    and record their errors.
  - **AI gateway.** All AI goes through one gateway: Claude Opus 5.5 first, another provider
    later is an adapter, not a rewrite. Every call is logged with model, tokens, estimated
    cost and time, and answers must match a strict format before anything is saved.
  - The screens look the same as at Milestone 1; this milestone is the foundation.
- _How the next modules plug in._ Milestone 2: the upload screen stores files through the
  document store, which records a "document uploaded" event; a reading job asks the
  gateway to read the document; the facts come back as "pending review" for his team to
  confirm. Milestone 3 reuses the same path for tenders. Later modules add tables that
  follow the same conventions, new job types for new background work and AI agents, new
  gateway tasks for new AI work, and new rows in the role table.
- _To show him._ The live link (sign up and onboarding as before), ARCHITECTURE.md in the
  repository once he has GitHub access, and a `verify:rls` run (each security check printed
  as PASS).

---

## E2 · Company DNA and evidence — 19 – 28 Oct

**Goal:** Thulani uploads his company pack; each document is stored as a hashed version, the AI reads its type, issuer, dates and certification stamps as sourced facts, his team confirms them, and confirmed evidence shows its validity based on the document's own dates.

**Session start:** read CLAUDE.md, E1.5 handoff notes, this epic, the Architecture rules, ARCHITECTURE.md §5 and §8. Skills: `supabase-postgres-best-practices`, `supabase`, `frontend-design`, `claude-api`.

- `[TODO]` **E2.1** — Schema: `extracted_facts` (company, subject type and id, document version, field, value, page, quote, confidence, produced by AI run or person, review status, reviewed by/at, superseded by) and `evidence_items` (company, document, category, holder, issue date, expiry date, stated validity, certification date and office, confirmed version). Company setting: expiring-soon reminder window (default 30 days; a reminder, not a compliance rule). RLS + `verify:rls`.
- `[TODO]` **E2.2** — Upload: Company DNA upload by category through the E1.5.4 helper; uploading a renewed document adds a new version and keeps history. Audit + `document.uploaded` event + `document.read` job.
- `[TODO]` **E2.3** — Reading job: the `document.read` handler calls the gateway task `read_company_document` and saves facts as pending review: document type, issuer, entity name, registration number, address, issue date, expiry date or validity stated in the document (e.g. "valid 12 months from the date signed by the commissioner"), every certification stamp (date, office, page). Never infer, never judge authenticity, "not found" instead of guesses. `document.read` event on completion; failures retried and visible.
- `[TODO]` **E2.4** — Validity engine: pure function from confirmed facts + today → `valid` / `expiring soon` / `expired` / `no expiry stated` / `date unknown`, with the reason. Uses only the document's own expiry or its own stated validity. Certification age is shown as information ("certified 8 months ago"), never judged here; that needs a tender rule (E4). Unit tests from synthetic cases modelled on the sample pack.
- `[TODO]` **E2.5** — Review screen: document preview beside the AI-read facts with page and quote; confirm, correct or reject each fact. Confirming creates or updates the evidence item. Audit + events.
- `[TODO]` **E2.6** — Company DNA page: evidence by category with validity pills, version history per document, filter by status; dashboard "expiring soon" list; settings for the reminder window.
- `[TODO]` **E2.7** — Live run on Thulani's real pack from `/fixtures/private/` (after his POPIA consent): the AI must read the SAPS stamp dates, the affidavit's stated 12-month validity and the CSD report's B-BBEE dates as facts. E2E (fake provider) for upload → read → review → validity. Deploy and demo.

**Cut line:** dashboard "expiring soon" list (E2.6); field-by-field correction can become confirm/reject only (E2.5).

**Handoff notes:** _(write at end of session)_

---

## E3 · Tender reading and Digital Twin — 29 Oct – 4 Nov

**Goal:** upload a tender, RFQ, RFP or quotation request and get an extensible Digital Twin: key facts, returnable documents and conditions, and only the rules the tender actually states, each linked to its page and quote, ready for a person to confirm.

**Session start:** read CLAUDE.md, E2 handoff notes, this epic, the Architecture rules, ARCHITECTURE.md §5, §8, §9. Skills: `supabase-postgres-best-practices`, `claude-api`, `frontend-design`. Needs the Tshwane PDF (see Waiting).

- `[TODO]` **E3.1** — Schema: `tenders` (company, kind tender/RFQ/RFP/quotation, reference, title, issuer, closing date/time, briefing date and whether compulsory, scoring system, stage reusing `src/lib/tenders/stages.ts`), `tender_documents` (company, tender, document, role main/addendum/annexure/returnable form), `tender_requirements` (company, tender, wording, kind returnable document/condition/form, mandatory, document category, rule, source document version, page, quote, confidence, review status). Rules are typed JSON validated by one Zod schema (for example certified-copy maximum age, issued-within, valid at closing, original required, signed required); a rule can only be stored with its quote. Tender facts use `extracted_facts`. RLS + `verify:rls`.
- `[TODO]` **E3.2** — Upload a tender (and later addenda) as documents → tender in stage `reading` + `tender.read` job. Originals unchanged.
- `[TODO]` **E3.3** — Reading job: gateway task `read_tender` → key facts, requirements and stated rules, each with page and quote. A rule without a quote from the tender is rejected. Generic for any tender; no Tshwane-specific code. Long PDFs handled within model limits.
- `[TODO]` **E3.4** — Requirement mapping: deterministic lookup from common wording (CSD report, tax compliance PIN, B-BBEE, CIPC, municipal account…) to document categories, with a gateway suggestion only where the lookup has no match. A person can change the mapping.
- `[TODO]` **E3.5** — Tender page (Digital Twin view): facts with page references, documents (main, addenda), requirements with their rules and quotes, confirm/edit, stage tracker.
- `[TODO]` **E3.6** — Tender board and dashboard show real tenders: board by stage, list sorted by closing date, "closing in 7 days" count.
- `[TODO]` **E3.7** — Live run on the Tshwane tender and both RFQs; record misses in handoff notes and fix the prompt/schema. E2E (fake provider) for upload → twin visible. Deploy and demo.

**Cut line:** gateway suggestion in E3.4 (manual mapping only); stage tracker visuals (E3.5).

**Handoff notes:** _(write at end of session)_

---

## E4 · Compliance and gap report — 5 – 11 Nov

**Goal:** for any tender, every requirement shows whether the company's confirmed evidence meets the rules that tender states, why not if it doesn't, mandatory gaps listed first, and a person records a decision on each.

**Session start:** read CLAUDE.md, E3 handoff notes, this epic, the Architecture rules, ARCHITECTURE.md §8 and §9. Skills: `supabase-postgres-best-practices`, `frontend-design`, `web-design-guidelines`.

- `[TODO]` **E4.1** — Schema: `requirement_decisions` (company, requirement, decision confirmed/overridden/not applicable, reason required for overridden and not applicable, decided by/at, snapshot of the computed result). Append-only. RLS + `verify:rls`.
- `[TODO]` **E4.2** — Rule engine: pure, deterministic code (no AI). Requirement + its stated rules + confirmed evidence + closing date → compliant, expiring, expired, missing, conflict, needs verification or unable to verify, each with a plain-language reason. Applies only the rules on the requirement; with no rule, checks presence, confirmation and the document's own validity at closing. `Map` lookups. Unit tests including "tender silent → no age limit" and "tender states 3 months → stamp of 21 Jan 2026 is too old".
- `[TODO]` **E4.3** — Cross-document checks: company name, registration number and address across confirmed evidence (normalised: case, punctuation, "(Pty) Ltd"), plus conflicting dates for the same certificate. Mismatches become conflict findings naming both documents. Unit tests from the sample pack's address and B-BBEE date conflicts.
- `[TODO]` **E4.4** — Compliance page: mandatory gaps first, then every requirement with its pill, matched evidence, tender page reference, rule quote and reason. Decisions with reasons are audit-logged and emit events. Results computed on load; decisions stored.
- `[TODO]` **E4.5** — Gap report: a print-friendly page (browser print to PDF) listing what is missing, expired or in conflict, the rule and page behind each, and what to do. No PDF library.
- `[TODO]` **E4.6** — Tender moves to stage `checked` when every mandatory requirement has a decision. E2E for pack + tender → gap report. Deploy and demo.

**Cut line:** address comparison in E4.3 (keep name and registration number); automatic stage change (E4.6).

**Handoff notes:** _(write at end of session)_

---

## E5 · Pilot and handover — 12 – 18 Nov

**Goal:** Phase 1 runs on real tenders and Thulani's real pack, live on his own accounts, with documentation he and a future developer can follow, and ownership transferred on final payment.

**Session start:** read CLAUDE.md, E4 handoff notes, this epic, all of ARCHITECTURE.md. Skills: `supabase`, `web-design-guidelines`.

- `[TODO]` **E5.1** — Pilot: run the Tshwane tender, both RFQs and his pack end to end. Log every wrong or missed finding in `docs/PILOT.md`.
- `[TODO]` **E5.2** — Fix pilot findings (timeboxed to one day; the rest becomes a list for him).
- `[TODO]` **E5.3** — Security pass: `verify:rls` covers every table and storage policy; E2E proves one company cannot see another's data; `supabase db advisors` clean; no secrets in the client bundle; jobs route protected.
- `[TODO]` **E5.4** — Go live on his accounts: Vercel and Supabase under his ownership (transfer or fresh project + migrations), his Anthropic key, auth redirect URLs and email delivery, spend limit confirmed.
- `[TODO]` **E5.5** — Handover docs: a two-page user guide, an admin runbook (env vars, deploys, migrations, jobs, rotating keys, adding an AI provider), ARCHITECTURE.md and API_AND_DATA_FLOW.md brought up to date.
- `[TODO]` **E5.6** — Final sign-off checklist; on final payment transfer the GitHub repository, tag `m5`, and record the start of the 30-day bug-fix period.

**Cut line:** user guide shortened to one page (E5.5).

**Handoff notes:** _(write at end of session)_

---

## Waiting on the client

| Item                                                          | Needed by             | Status                                     |
| ------------------------------------------------------------- | --------------------- | ------------------------------------------ |
| Approval of the architecture and roadmap document             | E1.5                  | Sent 8 Oct; E1.5 built ahead of it (8 Oct) |
| Approval of Milestone 1.5 (R2,000) and the 18 Nov completion  | E1.5                  | Sent 8 Oct                                 |
| First 50% of Milestone 1.5                                    | E1.5                  | After approval                             |
| GitHub username, for read access to the repository            | E1.5                  | Requested in the architecture document     |
| Anthropic account with a developer invite to "Procurement OS" | E1.5.6 live run, E2.3 | Steps sent; gateway built, live run waits  |
| Written POPIA consent for AI processing of company documents  | E2.7                  | Requested in the architecture document     |
| City of Tshwane Q02-O1-2026-27 tender PDF (32 pages)          | E3.7                  | Not received; the two RFQ PDFs are in hand |
| Vercel and Supabase accounts in his name                      | E5.4                  | Not requested yet                          |

**Waiting on us:** `CRON_SECRET` in Vercel, the Next.js 16.3.8 upgrade decision and leaked-password protection (E1.5 handoff notes); Supabase auth URLs and the email delivery decision (E1 handoff notes, steps 2–3).

## Roadmap after Phase 1

Each stage is scoped and quoted separately. Build numbers refer to the client's Master Developer Booklet.

- **V1** (completes the golden path): bid / review / no-bid · BOQ extraction and pricing scenarios · submission pack builder · human approval and document lock · submission record · tasks and notifications · executive dashboard · basic AI orchestration. _Builds 7.05, 7.07–7.13, 7.25–7.27._
- **V1.5 / V2:** supplier intelligence · automated supplier RFQs · quote comparison · bid register and follow-ups · Company Brain · human completion centre · verification and trust engine · high-volume tender processing · multi-company SaaS (sign-up, plans, billing). _Builds 7.06, 7.14, 7.29, 7.37–7.40, 7.42–7.45._
- **Later:** opportunity discovery from portals · award-to-project · project management · procurement and purchase orders · logistics and proof of delivery · invoicing, payments and profitability · contract intelligence · email/Teams/WhatsApp · AI workforce at scale · B2B procurement network. _Builds 7.15–7.21, 7.28, 7.30–7.36, 7.41._

## Completion log

| Task   | Completed             | Branch                      | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | --------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1.1   | 2026-09-08 10:07 SAST | `feat/t1.1-project-init`    | `typecheck` ✅ · `lint` ✅ · `build` ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| T1.2   | 2026-09-08 15:15 SAST | `feat/t1.2-supabase-client` | `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · live client smoke test ✅ · env guards ✅ · `server-only` leak probe ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| T1.3   | 2026-09-08 15:47 SAST | `feat/t1.3-schema-rls`      | `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · migration applied to hosted DB ✅ · `verify:rls` 12/12 ✅ · generated types enforce schema ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| E1.1   | 2026-10-08 14:45 SAST | `main`                      | `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `verify:rls` 12/12 on hosted DB ✅ · branch already contained in `main`; deleted local + remote                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| E1.2   | 2026-10-08 15:00 SAST | `main`                      | `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:e2e` 2/2 ✅ (smoke + `server-only` leak probe; build fails as expected, tree left clean, `typecheck` still passes afterwards)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| E1.3   | 2026-10-08 15:18 SAST | `main`                      | `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:unit` 7/7 ✅ · `test:e2e` 13/13 ✅ against `next start` (log in/out, wrong password, guard redirects, open-redirect refusals, reset via `generateLink`, sign-up confirmation link, every `sb-` cookie response `no-store`) · screenshots 1280/390 ✅ · `web-design-guidelines` audit fixed ✅ · code review: open redirect and reset-without-recovery fixed ✅                                                                                                                                                                                                                                                                                                            |
| E1.4   | 2026-10-08 15:30 SAST | `main`                      | 2 migrations tried locally first, then `db:push` to hosted ✅ · `db advisors` clean ✅ · `verify:rls` 20/20 on hosted ✅ (no second onboarding, no second or joined org, whitespace names, anon, private schema unreachable) · `db:types` ✅ · `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:unit` 7/7 ✅ · `test:e2e` 16/16 ✅ (sign up → confirm → onboarding → workspace) · screenshots 1280/390 ✅ · audit ✅ · code review: log-out on onboarding, whitespace names fixed ✅                                                                                                                                                                                                                                       |
| E1.5   | 2026-10-08 15:37 SAST | `main`                      | migration tried locally (owner-level update/delete/truncate blocked, org cascade works) then `db:push` ✅ · advisors clean ✅ · `verify:rls` 27/27 on hosted ✅ (no cross-company reads, no direct writes, no update/delete even as service role) · `db:types` ✅ · `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:unit` 7/7 ✅ · `test:e2e` 16/16 ✅ (onboarding writes one `workspace.created` event) · code review: redirect swallowing and cleanup counting fixed ✅                                                                                                                                                                                                                                                 |
| E1.6   | 2026-10-08 15:41 SAST | `main`                      | design plan in ARCHITECTURE §6 before code ✅ · tokens + 7 status tokens, `StatusPill` ✅ · contrast all text ≥ 4.9:1, control borders 3:1 ✅ · no green/purple/gradients ✅ · screenshots 1280/390 ✅ · audit ✅ · `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:e2e` 16/16 ✅ · code review fixes ✅                                                                                                                                                                                                                                                                                                                                                                                                                  |
| E1.7   | 2026-10-08 15:47 SAST | `main`                      | `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:unit` 7/7 ✅ · `test:e2e` 21/21 ✅ (sidebar nav + `aria-current`, account menu incl. Esc and link-close, settings data, phone drawer, no sideways scroll at 390px on every page) · screenshots 1280/390 ✅ · audit fixes (drawer backdrop, invalid aria-label) ✅ · code review fix (menu closes on navigation) ✅                                                                                                                                                                                                                                                                                                                                                        |
| E1.8   | 2026-10-08 15:51 SAST | `main`                      | `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:unit` 7/7 ✅ · `test:e2e` 23/23 ✅ (dashboard empty states + legend; board has 4 stage columns at 0, no sample tenders, upload disabled with its reason) · screenshots 1280/390 ✅ · audit ✅ · code review fix (upload note copy) ✅                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| E1.9   | 2026-10-08 17:18 SAST | `main`                      | live: `/` → 307 `/login` ✅ · `smoke` + `auth` E2E against the live URL 11/11 ✅ (incl. `no-store` on every auth-cookie response through Vercel's CDN) · test data cleaned up ✅ · deploy failures were Vercel env vars named without `NEXT_PUBLIC_`, fixed by the user ✅ · flaky first log-in fixed (Playwright `expect` timeout 10 s) ✅                                                                                                                                                                                                                                                                                                                                                                                             |
| E1.5.1 | 2026-10-08 17:36 SAST | `main`                      | docs only · `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:unit` 7/7 ✅ · `test:e2e` 23/23 ✅ (first run lost 4 tests to a network blip in fixture setup, `fetch failed`; re-run clean) · code review: 5 doc contradictions fixed (approval wording, child tables carry `organization_id`, memberships read exception, `updated_at` only on mutable tables, E1.5 ticket/epic name clash) ✅                                                                                                                                                                                                                                                                                                                              |
| E1.5.2 | 2026-10-08 17:58 SAST | `main`                      | 3 migrations: steps 1–2 tried locally first (backfill on seeded data, both guard layers, cascades through the Auth admin API, mutation test of the helper), step 4 locally after the fact · `db:push` ✅ · advisors: 4 SECURITY DEFINER warnings fixed; only Auth leaked-password protection left (dashboard) · `db:types` ✅ · `verify:rls` 39/39 on hosted and local ✅ · `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:unit` 7/7 ✅ · `test:e2e` 25/25 ✅ (two companies → selected one with its role; removed member told to ask for access) · live smoke + onboarding 5/5 ✅ · code review: stuck removed member fixed ✅ · audit: long email wraps ✅                                                             |
| E1.5.3 | 2026-10-08 18:07 SAST | `main`                      | migration tried locally then `db:push` (dry run listed only it) ✅ · advisors: only Auth leaked-password protection (dashboard) · `db:types` ✅ (compile-time role/enum check failed before, passed after) · `verify:rls` 41/41 ✅ (viewer reads only its company, cannot edit it) · `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:unit` 14/14 ✅ · `test:e2e` 25/25 ✅ (a first run lost 12 tests to `fetch failed` in setup while other network jobs ran; 7 orphaned test companies found and deleted, helper fixed) · code review: viewer audit check tightened ✅                                                                                                                                                   |
| E1.5.4 | 2026-10-08 18:27 SAST | `main`                      | 2 migrations tried locally first (numbering, immutability as owner and service role, company cascade with the two-way FK), dry runs listed only them, `db:push` ✅ · advisors clean except Auth leaked-password protection · `db:types` ✅ · `verify:rls` 51/51 hosted + local ✅ (no cross-company read/list/signed URL/overwrite/delete of files; no direct writes; versions immutable even for the service role; storage policy mutation-tested) · `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:unit` 19/19 ✅ · `test:e2e` 32/32 ✅ (7 document-store tests against the real DB and storage) · code review: 3 fixed (audit entry lost on retry, archived documents blocking re-upload, simultaneous duplicates) ✅ |
| E1.5.5 | 2026-10-08 18:42 SAST | `main`                      | migration tried locally (atomic event + job, two concurrent claims skip each other's job, stale reclaim, exhausted → failed, events immutable, cascade) then `db:push` (dry run listed only it) ✅ · advisors clean except Auth leaked-password protection · `db:types` ✅ · `verify:rls` 57/57 hosted + local ✅ · `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · `test:unit` 32/32 ✅ (backoff, retry, last attempt, permanent, unknown type, bad payload, timeout + abort, drain waits, budget-sized claims) · `test:e2e` 35/35 ✅ (runner refuses without secret; ping → succeeded; failing ping → failed with error; onboarding and uploads record domain events) · code review: claims now sized to the time budget ✅   |
| E1.5.6 | 2026-10-08 18:59 SAST | `main`                      | migration tried locally (append-only for owner and service role, company cascade), dry run listed only it, `db:push` ✅ · advisors clean except Auth leaked-password protection · `db:types` ✅ · `verify:rls` 59/59 hosted + local ✅ · `typecheck` ✅ · `lint` ✅ (SDK import refused outside the adapter) · `format` ✅ · `build` ✅ (no `ANTHROPIC_API_KEY`) · `test:unit` 50/50 ✅ (gateway with fake provider; adapter offline: request body, headers, refusal, truncation, errors, unconvertible schema; boundary) · `test:e2e` 37/37 ✅ (`ai_runs` rows for success and not-configured) · `test:ai-live` skipped (no key) · code review: schema conversion errors made non-retryable ✅                                         |
| E1.5.7 | 2026-10-08 19:07 SAST | `main`                      | fresh clone of `main` (`524fd9f`) with `npm ci`: `typecheck` failed without generated route types → fixed (`next typegen && tsc`); then `lint` ✅ · `format` ✅ · `test:unit` 50/50 ✅ · `test:e2e` 37/37 ✅ · `verify:rls` 59/59 ✅ · live site after E1.5.6: smoke, shell, onboarding, jobs 13 passed, 2 skipped (need `CRON_SECRET`) ✅ (an earlier run hit `net::ERR_NETWORK_CHANGED` on this machine; no test data left) · docs: ER diagram and API register match the code ✅ · code review: runner-limit warning corrected, ticket status fixed (a third finding was a false positive) ✅                                                                                                                                        |

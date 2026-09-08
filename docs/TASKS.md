# Task Board — AI Procurement OS V1 MVP

**Legend:** `[TODO]` · `[IN PROGRESS]` · `[DONE]`
**Working agreement:** one task at a time · one branch per task (`feat/tN.N-slug`) · typecheck + lint + build must pass before commit · every new user journey ships with a Playwright E2E test (from T1.5) · check in with the user after every task.

---

### Epic 1: Repository Foundation & Supabase Setup

- `[DONE]` **T1.1** — Initialize Next.js TS project with Tailwind, ESLint, Prettier, Lucide. _(2026-09-08 10:07 SAST)_
- `[DONE]` **T1.2** — Configure Supabase client (browser + server) and environment variables. _(2026-09-08 15:15 SAST)_
- `[TODO]` **T1.3** — Define initial database migration: `organizations`, `profiles`, and RBAC with RLS.
- `[TODO]` **T1.5** — Playwright E2E harness: install `@playwright/test`, add `playwright.config.ts`, `tests/e2e/` and a `test:e2e` script. **Listed before T1.4 on purpose** — T1.4 ships the first real user journey, and no new journey may merge without E2E coverage, so the harness must exist first.
  - Include a `server-only` leak probe: importing `admin.ts` from a Client Component must fail the build. Verified by hand during T1.2 but currently unguarded, and it protects the RLS-bypassing secret key.
- `[TODO]` **T1.4** — Implement Auth flow (Login, Sign-up, Protected Route Middleware → **`proxy.ts`**, see ARCHITECTURE.md §4). _Blocked by T1.5._
  - **Acceptance criterion (security, from the T1.2 review).** `proxy.ts` MUST apply the cache headers that `@supabase/ssr` passes as the **second argument** to `setAll` — `private, no-cache, no-store, must-revalidate, max-age=0` (see `@supabase/ssr/dist/main/cookies.js:506`). `src/lib/supabase/server.ts` declares `setAll(cookiesToSet)` with arity 1 and discards them, so **no component in the system applies them today**. Without this, a CDN or reverse proxy can cache one user's session token and serve it to another. Any Route Handler that writes auth cookies must carry them too.
  - **Acceptance criterion (E2E).** Assert that a response which sets auth cookies carries `no-store`.
  - **Cleanup (from the T1.2 review).** Move `SUPABASE_PROJECT_ID` out of the runtime schema in `src/lib/env/server.ts`. It is consumed only by the Supabase CLI, but `admin.ts` imports `serverEnv`, so a missing value throws at runtime for a variable nothing reads.
  - **Before the first push.** Set the `NEXT_PUBLIC_*` env vars in Vercel and CI. Nothing outside `src/lib/` imports `publicEnv` yet, so builds pass without them today; the moment T1.4 imports it, a missing value is a hard build failure.

### Epic 2: UI Shell & Design System Port

- `[TODO]` **T2.1** — Port prototype UI layout (Sidebar, Header, Metrics Grid, Panels, Status Pills).
- `[TODO]` **T2.2** — Setup global state / dashboard navigation structure.
- `[TODO]` **T2.3** — Implement `/docs/ARCHITECTURE.md` with base Mermaid architecture diagram.

### Epic 3: Company DNA (Evidence Locker)

- `[TODO]` **T3.1** — Database schema & storage bucket for `company_documents` and `evidence_items`.
- `[TODO]` **T3.2** — Evidence Locker UI (upload, document metadata, expiry tracking, view/delete).
- `[TODO]` **T3.3** — Server actions/APIs for evidence CRUD with tenant isolation.

### Epic 4: Tender Workspace & Digital Twin

- `[TODO]` **T4.1** — Database schema for `tenders`, `tender_requirements`, and `tender_documents`.
- `[TODO]` **T4.2** — Tender file upload pipeline to Supabase Storage.
- `[TODO]` **T4.3** — Extraction pipeline (AI/LLM or Python parser) returning structured tender metadata.
- `[TODO]` **T4.4** — Tender Workspace UI displaying Digital Twin & Technical Intelligence.

### Epic 5: Compliance Matrix & Gap Engine

- `[TODO]` **T5.1** — Database schema for `compliance_items` and scoring rules (e.g. 80/20 preference points).
- `[TODO]` **T5.2** — Compliance matching logic (cross-referencing Tender Requirements vs Company DNA).
- `[TODO]` **T5.3** — Interactive Compliance Matrix UI with status badges (`FOUND`, `MISSING`, `VERIFY`).

### Epic 6: BOQ & Pricing War Room

- `[TODO]` **T6.1** — Database schema for `boq_items` and `pricing_scenarios` (Aggressive, Balanced, Conservative).
- `[TODO]` **T6.2** — Pricing table UI with live margin/VAT calculations and scenario toggle.
- `[TODO]` **T6.3** — Data persistence with mutation validation to prevent BOQ overwrites.

### Epic 7: Form Intelligence & Submission Builder Gate

- `[TODO]` **T7.1** — MBD form field mapping definitions (MBD 1, 4, 6.1, 8, 9).
- `[TODO]` **T7.2** — Form Intelligence UI showing completion status and human signature indicators.
- `[TODO]` **T7.3** — Submission Builder UI with readiness score meter.
- `[TODO]` **T7.4** — Implement Human Approval Gate modal and export checklist.
- `[TODO]` **T7.5** — Final end-to-end integration test of the live test case (City of Tshwane tender).

---

## Blocked / Waiting

| Item                                      | Blocks     | Owner | Notes                                                                                                                                          |
| ----------------------------------------- | ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                       | T4.3, T5.2 | User  | Needed for tender extraction and compliance matching.                                                                                          |
| City of Tshwane Q02-01-2026-27 source PDF | T4.3, T7.5 | User  | Live test case for the end-to-end run.                                                                                                         |
| **Rotate `SUPABASE_SECRET_KEY`**          | —          | User  | The key was pasted into a chat transcript during T1.2 setup. Rotate in Project Settings → API Keys, then update `.env.local`. It bypasses RLS. |

## Completion Log

| Task | Completed             | Branch                      | Verification                                                                                                                    |
| ---- | --------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| T1.1 | 2026-09-08 10:07 SAST | `feat/t1.1-project-init`    | `typecheck` ✅ · `lint` ✅ · `build` ✅                                                                                         |
| T1.2 | 2026-09-08 15:15 SAST | `feat/t1.2-supabase-client` | `typecheck` ✅ · `lint` ✅ · `format` ✅ · `build` ✅ · live client smoke test ✅ · env guards ✅ · `server-only` leak probe ✅ |

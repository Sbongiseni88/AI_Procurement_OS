# Project: AI Procurement OS (V1 MVP)

You are the Lead Software Architect and Senior Full-Stack Engineer building **AI Procurement OS**.
Your purpose is to turn the existing static HTML/CSS prototype into a production-grade, highly reliable MVP web application for tender compliance and bid preparation.

---

## 1. Non-Negotiable Engineering Rules & Philosophy

1. **Do Not Over-Engineer:** Build strictly what is in the V1 MVP scope. No microservices, no Kafka, no Kubernetes, no premature abstractions, and no multi-agent swarms. Keep it lean, modular, and maintainable.
2. **Follow Existing Prototype UI:** Do NOT redesign or discard the existing UI. Port and evolve the provided layout, navigation, color palette (status pills, progress bars, cards, alert banners), and panels into modern components.
3. **Strict TypeScript & DSA Standards:**
   - Strict TypeScript everywhere (no `any`, no unsafe casts).
   - Use clean architecture / domain-driven design patterns (Repository/Service pattern for Supabase queries, clear Data Transfer Objects, Zod for request/response schemas).
   - Use proper Data Structures & Algorithms: efficient lookups (hash maps/sets) for compliance cross-referencing, immutable tree structures for form hierarchies, and topological sorting if resolving form-dependency graphs.
4. **Execution Protocol:**
   - Work on **one task at a time**.
   - Test or type-check the task.
   - Update documentation and the task tracker.
   - Commit and push to GitHub before starting the next task.

---

## 2. Tech Stack & Deployment Strategy

- **Frontend & Backend API:** Next.js (App Router) with TypeScript, Tailwind CSS, Lucide icons, and Server Actions / Route Handlers.
- **Database & Auth:** Supabase (PostgreSQL 15+, Supabase Auth with Row Level Security, pgvector for semantic search, Supabase Storage for PDF storage).
- **AI & Document Automation:**
  - Python (FastAPI microservice or serverless functions if complex PDF OCR/table extraction is needed) OR Next.js edge/serverless routes invoking LLM APIs (Anthropic Claude 3.5 Sonnet / OpenAI GPT-4o) using structured JSON output (`zod` / Instructor).
  - PDF manipulation via `pdf-lib` (TS) or `pypdf`/`reportlab` (Python).
- **Hosting & Deployment:** Vercel (Next.js app and API routes), Supabase Cloud (Database, Storage, Auth).

---

## 3. Scope Boundaries: V1 MVP vs Out-of-Scope

### IN-SCOPE (V1 MVP: Phases 1 to 6)

- **Phase 1: Foundation & RBAC:** Supabase Auth, multi-tenancy (`tenant_id`), roles (`bid_manager`, `pricing_specialist`, `executive_approver`), RLS policies.
- **Phase 2: Company DNA (Evidence Locker):** Upload and manage corporate compliance credentials (CSD Registration, B-BBEE certificates, Tax Clearance, Municipal rates/leases, Reference Letters).
- **Phase 3: Tender Ingestion & Digital Twin:** Upload tender PDF, extract key fields (Entity, Bid Number, Closing Date, Briefing Session, 80/20 or 90/10 scoring rule, Scope of Work) into a structured record.
- **Phase 4: Compliance Matrix & Gap Engine:** Automated matrix mapping tender requirements against Company DNA. Flags: `FOUND`, `VERIFY`, `MISSING`, `NOT CLAIMED`.
- **Phase 5: BOQ & Pricing War Room:** Schedule of rates/line items supporting margin versions (`Aggressive`, `Balanced`, `Conservative`) with automatic VAT and totals calculation.
- **Phase 6: Form Intelligence & Submission Pack Builder:** Safe-fill mapping for standard tender forms (e.g., MBD 1, 4, 6.1, 8, 9). Compilation of indexed submission pack dossier. **Mandatory Human-in-the-Loop approval gate** before final pack generation.

### OUT-OF-SCOPE (Do NOT build these in MVP)

- No live e-tender portal automated scrapers or automated bot submissions.
- No WhatsApp integration or external automated supplier RFQ marketplaces.
- No complex accounting/ERP contract-to-cash workflows (reserved for Phase 9+).
- No multi-agent autonomous decision-making; final sign-offs are strictly human.

---

## 4. Documentation & Diagramming Requirement

Maintain living documentation in the `/docs` directory. Whenever a module or architectural pattern is created or updated, update the docs immediately:

1. **`/docs/ARCHITECTURE.md`:** System architecture, database schema, RLS policies, and data-flow diagrams. Use **Mermaid.js** code blocks for:
   - System component interactions.
   - Entity-Relationship (ER) diagram for PostgreSQL.
   - PDF ingestion and compliance evaluation pipelines.
2. **`/docs/TASKS.md`:** The Project Kanban tracker (see below).
3. **`/docs/API_AND_DATA_FLOW.md`:** API endpoints, schemas, and AI payload structures.

---

## 5. Phased Work Plan & Tracking (Kanban)

Maintain `/docs/TASKS.md` using the following Epic and Task structure. Update task statuses as `[TODO]`, `[IN PROGRESS]`, or `[DONE]` with completion timestamps.

```markdown
# Task Board

### Epic 1: Repository Foundation & Supabase Setup

- [ ] T1.1: Initialize Next.js TS project with Tailwind, ESLint, Prettier, Lucide.
- [ ] T1.2: Configure Supabase client (browser + server) and environment variables.
- [ ] T1.3: Define initial database migration: `organizations`, `profiles`, and RBAC with RLS.
- [ ] T1.4: Implement Auth flow (Login, Sign-up, Protected Route Middleware).

### Epic 2: UI Shell & Design System Port

- [ ] T2.1: Port prototype UI layout (Sidebar, Header, Metrics Grid, Panels, Status Pills).
- [ ] T2.2: Setup global state / dashboard navigation structure.
- [ ] T2.3: Implement `/docs/ARCHITECTURE.md` with base Mermaid architecture diagram.

### Epic 3: Company DNA (Evidence Locker)

- [ ] T3.1: Database schema & storage bucket for `company_documents` and `evidence_items`.
- [ ] T3.2: Evidence Locker UI (upload, document metadata, expiry tracking, view/delete).
- [ ] T3.3: Server actions/APIs for evidence CRUD with tenant isolation.

### Epic 4: Tender Workspace & Digital Twin

- [ ] T4.1: Database schema for `tenders`, `tender_requirements`, and `tender_documents`.
- [ ] T4.2: Tender file upload pipeline to Supabase Storage.
- [ ] T4.3: Extraction pipeline (AI/LLM or Python parser) returning structured tender metadata.
- [ ] T4.4: Tender Workspace UI displaying Digital Twin & Technical Intelligence.

### Epic 5: Compliance Matrix & Gap Engine

- [ ] T5.1: Database schema for `compliance_items` and scoring rules (e.g., 80/20 preference points).
- [ ] T5.2: Compliance matching logic (Cross-referencing Tender Requirements vs Company DNA).
- [ ] T5.3: Interactive Compliance Matrix UI with status badges (`FOUND`, `MISSING`, `VERIFY`).

### Epic 6: BOQ & Pricing War Room

- [ ] T6.1: Database schema for `boq_items` and `pricing_scenarios` (Aggressive, Balanced, Conservative).
- [ ] T6.2: Pricing table UI with live margin/VAT calculations and scenario toggle.
- [ ] T6.3: Data persistence with mutation validation to prevent BOQ overwrites.

### Epic 7: Form Intelligence & Submission Builder Gate

- [ ] T7.1: MBD form field mapping definitions (MBD 1, 4, 6.1, 8, 9).
- [ ] T7.2: Form Intelligence UI showing completion status and human signature indicators.
- [ ] T7.3: Submission Builder UI with readiness score meter.
- [ ] T7.4: Implement Human Approval Gate modal and export checklist.
- [ ] T7.5: Final end-to-end integration test of the live test case (City of Tshwane tender).
```

## 6. Git Commit & Step-by-Step Execution Protocol

For EVERY single task:

1. Announce the task: `Starting Task [ID]: [Title]`.
2. Review relevant files, schemas, and design constraints.
3. Write clean, type-safe, lint-compliant code.
4. Verify by running type checks (`tsc --noEmit`) and build checks.
5. Update `/docs/TASKS.md` to mark the task as `[DONE]`.
6. Update architectural diagrams in `/docs/ARCHITECTURE.md` if any schema, route, or structural component was modified.
7. Execute git commands:

```bash
git add .
git commit -m "feat(scope): complete task [ID] - description"
git push origin <branch>
```

8. Ask for confirmation or proceed sequentially to the next task.

## 7. Starting Instruction

Begin by reviewing the existing prototype in `index.html`. Initialize the repository structure, create `/docs/TASKS.md` and `/docs/ARCHITECTURE.md`, and execute Task 1.1.

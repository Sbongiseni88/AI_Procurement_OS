# API & Data Flow — AI Procurement OS, Phase 1

> **Status:** No endpoints exist yet. Entries are added by the ticket that builds them
> (auth and onboarding from E1.3, uploads from E2.2, AI reading from E2.4 and E3.3).

## Conventions

These rules apply to every entry added below.

1. **Zod at every boundary.** Request bodies, Server Action arguments, and AI responses are
   parsed — never cast. `as` on external data is a lint-level defect (CLAUDE.md §1.3).
2. **Read path = Server Components.** Writes go through Server Actions; Route Handlers are
   reserved for file uploads and AI invocation, where streaming or multipart is needed.
3. **DTOs are explicit.** Database row shapes never leak into components. Repositories
   return domain types.
4. **Tenancy is never a query parameter.** `organization_id` is derived server-side from the
   session and enforced by RLS. A client-supplied tenant id is treated as an attack.
5. **AI output is a proposal, not a fact.** Extracted values are saved with source page,
   quote and confidence as _pending review_; only values a person confirms feed the expiry
   and compliance checks. AI never sets a compliance status.
6. **Every write that matters is audit-logged** through the single audit helper (E1.5):
   uploads, confirmations, corrections, overrides (with reason).

## Client Selection

Before adding an entry below, pick the right Supabase client (see ARCHITECTURE.md §7):

| Need                                                       | Use                                              |
| ---------------------------------------------------------- | ------------------------------------------------ |
| Read/write as the signed-in user (almost always)           | `createSupabaseServerClient()`                   |
| Client Component needing live data                         | `createSupabaseBrowserClient()`                  |
| Genuine cross-tenant work: migrations, cron, admin tooling | `createSupabaseAdminClient()` — **bypasses RLS** |

## Endpoint Register

| Route / Action | Kind | Auth | Request schema | Response schema | Task |
| -------------- | ---- | ---- | -------------- | --------------- | ---- |
| _none yet_     | —    | —    | —              | —               | —    |

## AI Payload Contracts

All calls go through the AI gateway (`src/lib/ai/`, E2.3), which validates output with Zod
and writes an `ai_runs` row (model, tokens, cost, latency, outcome).

| Pipeline                 | Model             | Input                     | Output schema (defined in ticket)                                                                                                                                         | Ticket |
| ------------------------ | ----------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Company document reading | `claude-opus-5-5` | One PDF or image          | `CompanyDocumentReadingSchema`: type, issuer, entity name, registration no., address, issue/expiry dates, certification stamps (date, office, page), confidence per field | E2.4   |
| Tender reading           | `claude-opus-5-5` | Tender or RFQ PDF         | `TenderReadingSchema`: reference, issuer, closing and briefing dates, scoring system, returnable documents with mandatory flag, validity rules, page + quote per item     | E3.3   |
| Requirement mapping hint | `claude-opus-5-5` | One unmatched requirement | `CategorySuggestionSchema`: suggested document category + confidence (used only when the lookup table has no match)                                                       | E3.4   |

Not AI: expiry status (E2.5), compliance matching (E4.1) and cross-document conflict checks
(E4.2) are deterministic functions with unit tests.

Every schema returns an explicit "not found" rather than a guessed value.

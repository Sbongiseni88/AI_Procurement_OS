# API & Data Flow — AI Procurement OS V1 MVP

> **Status:** No endpoints exist yet. The foundation (T1.1) is in place; this document is
> populated from T1.2 onward as Server Actions, Route Handlers and AI payloads are built.

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
5. **AI output is a proposal, not a fact.** Extraction and matching results are persisted
   with provenance and a `VERIFY` posture where confidence is not absolute. Human approval
   is mandatory before pack generation (T7.4).

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

| Pipeline                        | Model           | Input                            | Output schema             | Task |
| ------------------------------- | --------------- | -------------------------------- | ------------------------- | ---- |
| Tender Digital Twin extraction  | Claude Opus 5   | Tender PDF                       | `TenderDigitalTwinSchema` | T4.3 |
| Compliance requirement matching | Claude Sonnet 5 | Requirements + Company DNA index | `ComplianceMatchSchema`   | T5.2 |

Both schemas are defined when their task is implemented.

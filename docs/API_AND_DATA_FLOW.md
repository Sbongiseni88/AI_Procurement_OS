# API & Data Flow — AI Procurement OS, Phase 1

> **Status:** Auth (E1.3), onboarding (E1.4) and the audit helper (E1 ticket E1.5) are built. Entries
> are added by the ticket that builds them (platform core E1.5.2–E1.5.6, uploads E2.2, AI
> reading E2.3 and E3.3).

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
6. **Every write that matters is audit-logged** through the single audit helper,
   `recordAuditEvent({ action, entityId, details })` in `src/lib/audit/record.ts`:
   uploads, confirmations, corrections, overrides (with reason). Add each new action name
   to `AUDIT_ACTION_NAMES` there. The helper sets organization and actor itself; never pass
   them in. A database function that makes a material change writes its own entry in the
   same transaction instead. Logged so far: `workspace.created` (details: `organizationName`,
   `role`); `document.uploaded` by `add_document_version` (details: `versionId`,
   `versionNumber`, `sha256`, `sizeBytes`, `mimeType`; never the file name).

7. **Every write checks the permission matrix first.** A Server Action or server helper
   that writes calls `requirePermission(action)` (`src/lib/workspace/membership.ts`), which
   returns the active membership or throws `PermissionDeniedError`; turn that into a
   plain-language message. Actions are listed in `src/lib/auth/permissions.ts` (ARCHITECTURE.md
   §8, Permissions). The organization always comes from the returned membership.

## Client Selection

Before adding an entry below, pick the right Supabase client (see ARCHITECTURE.md §7):

| Need                                                       | Use                                              |
| ---------------------------------------------------------- | ------------------------------------------------ |
| Read/write as the signed-in user (almost always)           | `createSupabaseServerClient()`                   |
| Client Component needing live data                         | `createSupabaseBrowserClient()`                  |
| Genuine cross-tenant work: migrations, cron, admin tooling | `createSupabaseAdminClient()` — **bypasses RLS** |

## Endpoint Register

| Route / Action                                        | Kind          | Auth                          | Request schema                                                                                                                      | Response                                                                                                                                                                               | Task   |
| ----------------------------------------------------- | ------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `proxy` (`src/proxy.ts`)                              | Proxy         | any                           | —                                                                                                                                   | refreshes session; redirects to `/login?next=` or away from guest pages                                                                                                                | E1.3   |
| `logIn` (`src/lib/auth/actions.ts`)                   | Server Action | signed out                    | `LogInSchema` (email, password, next?)                                                                                              | `AuthFormState`, or redirect to `safeNextPath(next)`                                                                                                                                   | E1.3   |
| `signUp`                                              | Server Action | signed out                    | `SignUpSchema` (email, password ≥ 8)                                                                                                | `AuthFormState` `sent` (confirmation email), or redirect to `/`                                                                                                                        | E1.3   |
| `requestPasswordReset`                                | Server Action | signed out                    | `PasswordResetRequestSchema` (email)                                                                                                | `AuthFormState` `sent`; same answer whether or not the account exists                                                                                                                  | E1.3   |
| `updatePassword`                                      | Server Action | fresh email-link session      | `NewPasswordSchema` (password, confirm)                                                                                             | `AuthFormState`, or redirect to `/`                                                                                                                                                    | E1.3   |
| `logOut`                                              | Server Action | signed in                     | —                                                                                                                                   | redirect to `/login`                                                                                                                                                                   | E1.3   |
| `GET /auth/callback`                                  | Route Handler | public                        | `?code=` or `?token_hash=&type=`, `next?`                                                                                           | redirect to `next` with session cookies, or `/login?error=link`; always `no-store`                                                                                                     | E1.3   |
| `completeOnboarding` (`src/lib/workspace/actions.ts`) | Server Action | signed in, no workspace yet   | `OnboardingSchema` (companyName, fullName; 1–200 chars)                                                                             | redirect to `/`; `OnboardingFormState` error otherwise                                                                                                                                 | E1.4   |
| `rpc/complete_onboarding`                             | Postgres RPC  | `authenticated`               | `company_name`, `full_name`                                                                                                         | new organization id (uuid), with the caller's profile and active `executive_approver` membership; `23505` if the caller already has a profile or membership, `22023` for invalid names | E1.4   |
| `rpc/switch_organization`                             | Postgres RPC  | `authenticated`               | `organization_id`                                                                                                                   | void; `42501` unless the caller has an **active** membership there. No UI yet (no one has a second membership before invitations)                                                      | E1.5.2 |
| `uploadDocumentFile` (`src/lib/documents/upload.ts`)  | Server helper | `documents.upload` permission | `StoreDocumentInputSchema`: `target` new (kind, title, category?) or existing (documentId); `file` (name, bytes)                    | `{ status: "stored", version }` or `{ status: "duplicate", existing }`; throws `DocumentStoreError` / `PermissionDeniedError`                                                          | E1.5.4 |
| `rpc/add_document_version`                            | Postgres RPC  | `service_role` only           | company, document and version ids, sha256, size, MIME type, file name, uploader; `p_new_kind/title/category` to create the document | the new `document_versions` row; `PT409` duplicate, `55000` archived, `P0002` not found                                                                                                | E1.5.4 |

**Workspace reads.** `getMembership()` / `requireMembership()` (`src/lib/workspace/membership.ts`)
return the signed-in person's active membership: `{ userId, email, fullName, role,
organization: { id, name } }`. It is read through RLS, which shows only the active company,
so it never trusts the selection stored on the profile (ARCHITECTURE.md §8, Active
company). `hasProfile()` tells the onboarding page whether a person without an active
membership is a first-time user (form) or a returning one (ask for access back).

`AuthFormState` (`src/lib/auth/schemas.ts`) is `idle` · `error` (message, per-field errors,
echoed email) · `sent` (message, email). Messages are plain language; Supabase's raw error
text is never shown.

## AI Payload Contracts

All calls go through the provider-neutral AI gateway (`src/lib/ai/`, E1.5.6), which validates
output with Zod and writes an `ai_runs` row (model, tokens, cost, latency, outcome).

| Pipeline                 | Model             | Input                     | Output schema (defined in ticket)                                                                                                                                              | Ticket |
| ------------------------ | ----------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Company document reading | `claude-opus-5-5` | One PDF or image          | `CompanyDocumentReadingSchema`: type, issuer, entity name, registration no., address, issue/expiry dates, certification stamps (date, office, page), confidence per field      | E2.3   |
| Tender reading           | `claude-opus-5-5` | Tender or RFQ PDF         | `TenderReadingSchema`: reference, issuer, closing and briefing dates, scoring system, returnable documents with mandatory flag, rules the tender states, page + quote per item | E3.3   |
| Requirement mapping hint | `claude-opus-5-5` | One unmatched requirement | `CategorySuggestionSchema`: suggested document category + confidence (used only when the lookup table has no match)                                                            | E3.4   |

Not AI: document validity (E2.4), the requirement rule engine (E4.2) and cross-document
conflict checks (E4.3) are deterministic functions with unit tests.

Every schema returns an explicit "not found" rather than a guessed value.

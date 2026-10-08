-- ============================================================================
-- E1.5.3 — read-only `viewer` role.
--
-- What each role may do is decided by the permission matrix in
-- `src/lib/auth/permissions.ts` (Architecture rule 3). The database only needs
-- the value to exist. A viewer reads their company's data like any member, and is
-- outside every role list in the policies (e.g. `organizations_update_own` allows
-- only bid_manager and executive_approver), so the database refuses their writes
-- even if the app had a bug.
--
-- Booklet roles are added the same way: a new enum value here, then a row in the
-- matrix (see ARCHITECTURE.md §8, Permissions).
-- ============================================================================

alter type public.app_role add value if not exists 'viewer';

comment on type public.app_role is
  'Membership role. What each role may do is defined in src/lib/auth/permissions.ts.';

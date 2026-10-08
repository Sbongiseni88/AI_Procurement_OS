-- ============================================================================
-- E1.5 — Audit log: append-only `audit_events`.
--
-- Who did what, to which record, in which company, and when. Later tickets log
-- uploads, AI-read confirmations and corrections, and compliance overrides (with
-- their reason) here; this ticket logs workspace creation.
--
-- Rules
--   * Read: members see their own organization's events only.
--   * Write: no user role can insert. Rows are written by one server helper
--     (`src/lib/audit/record.ts`) with the service role, which takes the
--     organization from the caller's membership and the actor from the verified
--     JWT. If `authenticated` could insert, anyone could forge entries in their
--     company's log through the API.
--   * Change: nobody updates, deletes or truncates, including service_role and
--     the table owner (trigger). The one exception is ON DELETE CASCADE when a
--     whole organization is removed: a company's history goes with the company.
-- ============================================================================

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- No foreign key on purpose: deleting a user must not rewrite history (SET NULL
  -- would be an UPDATE) or be blocked by it. NULL means the system acted.
  actor_id uuid,
  -- `<entity>.<past-tense verb>`, e.g. workspace.created, document.confirmed.
  action text not null check (action ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z_]*$'),
  entity_id uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.audit_events is
  'Append-only audit log. Written only by the server audit helper (service role).';

-- The read path is always "this organization's events, newest first".
create index audit_events_organization_created_idx
  on public.audit_events (organization_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Append-only, enforced below the privilege layer as well
-- ----------------------------------------------------------------------------
create or replace function private.forbid_audit_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A cascade from deleting the organization reaches this trigger from inside the
  -- foreign key's own trigger, i.e. one level deeper than a direct DELETE.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Audit events are append-only.' using errcode = '42501';
end;
$$;

revoke all on function private.forbid_audit_event_changes() from public;

create trigger audit_events_append_only
  before update or delete on public.audit_events
  for each row execute function private.forbid_audit_event_changes();

create trigger audit_events_no_truncate
  before truncate on public.audit_events
  for each statement execute function private.forbid_audit_event_changes();

-- ----------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ----------------------------------------------------------------------------
alter table public.audit_events enable row level security;

revoke all on public.audit_events from anon, authenticated, service_role;
grant select on public.audit_events to authenticated;
grant select, insert on public.audit_events to service_role;

create policy audit_events_select_own_org
  on public.audit_events for select to authenticated
  using (organization_id = (select public.current_organization_id()));

-- No INSERT, UPDATE or DELETE policy for any user role (see header).

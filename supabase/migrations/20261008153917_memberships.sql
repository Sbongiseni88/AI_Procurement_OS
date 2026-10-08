-- ============================================================================
-- E1.5.2 step 1 — memberships (additive) and backfill from profiles.
--
-- Until now each person's profile bound them to exactly one company and one role
-- (`profiles.organization_id`, `profiles.role`). The client's architecture needs a
-- person to be able to belong to several companies (a consultant, a group
-- director), so tenancy moves to `memberships`: one row per person and company,
-- with that person's role and status there.
--
-- This migration only ADDS: the table, its policies, the selected-company column
-- on profiles, and one membership per existing profile. Nothing reads them yet;
-- the session helpers and policies switch over in the next migration, and the old
-- profile columns are dropped once the app no longer reads them.
-- ============================================================================

create type public.membership_status as enum ('invited', 'active', 'removed');

comment on type public.membership_status is
  'Only active memberships give access. Removed memberships are kept (archive, never delete).';

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null default 'bid_manager',
  status public.membership_status not null default 'active',
  -- Who added this person. No foreign key (table conventions, ARCHITECTURE.md §8):
  -- deleting that person must not rewrite or block this row. NULL: added by the
  -- system (onboarding, backfill).
  invited_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_organization_user_key unique (organization_id, user_id)
);

comment on table public.memberships is
  'Person <-> company with a role. Access follows the active membership (E1.5.2).';

-- The unique constraint serves "members of this company" (organization_id first);
-- the session helpers look people up by user_id.
create index memberships_user_id_idx on public.memberships (user_id);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- The company a person is working in. A preference only: the session helpers
-- (next migration) use it to choose among the person's ACTIVE memberships, so a
-- value pointing at a company they do not belong to grants nothing.
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column active_organization_id uuid
    references public.organizations (id) on delete set null;

create index profiles_active_organization_id_idx on public.profiles (active_organization_id);

-- ----------------------------------------------------------------------------
-- Writes are privileged, enforced below the privilege layer as well
--
-- No user role holds INSERT, UPDATE or DELETE on memberships (grants below), so
-- nobody can add themselves to a company or raise their own role through the API.
-- This trigger is the second layer, as on profiles (T1.3): a future
-- `grant all ... to authenticated` must not silently re-open self-promotion.
-- SECURITY INVOKER on purpose, so `current_user` is the caller. Inside a SECURITY
-- DEFINER function such as onboarding it is the function's owner.
-- ----------------------------------------------------------------------------
create or replace function private.forbid_membership_changes_by_users()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  -- Cascades from deleting a person or a company reach this trigger one level
  -- deeper than a direct statement; they must not be blocked.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Memberships cannot be changed through the API.' using errcode = '42501';
end;
$$;

revoke all on function private.forbid_membership_changes_by_users() from public;

create trigger memberships_forbid_user_changes
  before insert or update or delete on public.memberships
  for each row execute function private.forbid_membership_changes_by_users();

-- ----------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ----------------------------------------------------------------------------
alter table public.memberships enable row level security;

revoke all on public.memberships from anon, authenticated, service_role;
grant select on public.memberships to authenticated;
-- No DELETE, even for the service role: a membership ends by status 'removed'
-- (archive, don't delete). Rows still go when their person or company is deleted.
grant select, insert, update on public.memberships to service_role;

-- A person sees their own memberships (in any company) and every membership in the
-- company they are currently working in. Until the next migration
-- current_organization_id() still reads profiles; the result is the same company.
create policy memberships_select_own_or_current_org
  on public.memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or organization_id = (select public.current_organization_id())
  );

-- No INSERT, UPDATE or DELETE policy for any user role (see the trigger above).

-- ----------------------------------------------------------------------------
-- Backfill: one active membership per existing profile, same company and role,
-- dated when the person joined. The profile's company becomes its selection.
-- ----------------------------------------------------------------------------
insert into public.memberships (organization_id, user_id, role, status, created_at, updated_at)
select p.organization_id, p.id, p.role, 'active', p.created_at, p.created_at
from public.profiles p
on conflict (organization_id, user_id) do nothing;

update public.profiles
set active_organization_id = organization_id
where active_organization_id is null;

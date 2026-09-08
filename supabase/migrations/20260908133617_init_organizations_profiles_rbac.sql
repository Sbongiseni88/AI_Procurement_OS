-- ============================================================================
-- T1.3 — Foundation schema: organizations, profiles, RBAC and RLS.
--
-- Tenancy model
-- -------------
-- `organizations` is the tenant. Every user has exactly one `profiles` row that
-- binds them to exactly one organization. `profiles.organization_id` is NOT NULL
-- on purpose: a nullable tenant key invites `organization_id = NULL` comparisons,
-- which evaluate to NULL in SQL and are a classic source of policy bypass.
--
-- Threat being defended against
-- -----------------------------
-- Tenants are competing bidders. A cross-tenant read exposes a rival's pricing
-- and compliance gaps; a privilege escalation lets a user approve their own bid.
-- RLS is the enforcement point — the application layer never filters by tenant
-- itself (see docs/ARCHITECTURE.md §1).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Roles
-- ----------------------------------------------------------------------------
create type public.app_role as enum (
  'bid_manager',
  'pricing_specialist',
  'executive_approver'
);

-- ----------------------------------------------------------------------------
-- organizations
-- ----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- South African supplier identifiers. Nullable: an organization may be created
  -- before its Company DNA evidence is gathered (Phase 2).
  registration_number text,
  vat_number text,
  csd_supplier_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is
  'Tenant root. One row per bidding company; all tenant-scoped data hangs off this.';

-- ----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  role public.app_role not null default 'bid_manager',
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Binds an auth.users row to exactly one organization and one RBAC role.';
comment on column public.profiles.role is
  'RBAC role. Users cannot change their own role — see the guard trigger below.';

-- Every RLS policy on tenant data filters by organization_id, so this index is
-- load-bearing for performance, not just for joins.
create index profiles_organization_id_idx on public.profiles (organization_id);

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Session helpers
--
-- These are SECURITY DEFINER for a specific reason: a policy on `profiles` that
-- reads `profiles` would recurse infinitely. Running as the function owner
-- bypasses RLS on the lookup and breaks the cycle.
--
-- `set search_path = ''` is mandatory on any SECURITY DEFINER function: without
-- it, a caller can prepend a schema to search_path and hijack an unqualified
-- name to run their own code with the owner's privileges. Every identifier
-- inside these bodies is therefore fully qualified.
--
-- Both return NULL when the caller has no profile, which makes every policy
-- below fail CLOSED (`x = NULL` is NULL, never true).
-- ----------------------------------------------------------------------------
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- SECURITY DEFINER functions are executable by PUBLIC by default. Lock them to
-- authenticated callers only.
revoke execute on function public.current_organization_id() from public;
revoke execute on function public.current_user_role() from public;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;

-- ----------------------------------------------------------------------------
-- Privilege escalation guard
--
-- RLS policies cannot restrict WHICH COLUMNS an UPDATE touches, and a WITH CHECK
-- clause cannot see the previous row. Column-level GRANTs below are the primary
-- control; this trigger is deliberate defence-in-depth, because a future
-- migration doing `grant all on public.profiles to authenticated` would silently
-- re-open self-promotion to executive_approver — i.e. approving your own bid.
-- ----------------------------------------------------------------------------
create or replace function public.forbid_self_privilege_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Deliberately SECURITY INVOKER (the default). A SECURITY DEFINER function
  -- would make `current_user` resolve to the function OWNER rather than the
  -- caller, so the privileged-role check below would never match and every
  -- legitimate administrative role change would be rejected.
  --
  -- service_role is the secret key; postgres/supabase_admin are migrations and
  -- direct administration. Those legitimately administer roles and tenancy.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'A user may not change their own role.'
      using errcode = '42501';
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'A user may not move themselves between organizations.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_forbid_self_privilege_change
  before update on public.profiles
  for each row execute function public.forbid_self_privilege_change();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;

-- Supabase grants broad default privileges on the public schema. Reset them and
-- re-grant precisely. `anon` gets nothing: none of this data is public.
revoke all on public.organizations from anon, authenticated;
revoke all on public.profiles from anon, authenticated;

grant select on public.organizations to authenticated;
grant update (name, registration_number, vat_number, csd_supplier_number)
  on public.organizations to authenticated;

grant select on public.profiles to authenticated;
-- Column-scoped: `role` and `organization_id` are intentionally absent, so a
-- self-promotion UPDATE is rejected at the privilege layer before RLS runs.
grant update (full_name) on public.profiles to authenticated;

-- The admin client (secret key) must retain full access; it bypasses RLS.
grant all on public.organizations to service_role;
grant all on public.profiles to service_role;

-- --- organizations policies -------------------------------------------------
-- `(select fn())` rather than `fn()` so Postgres evaluates it once per statement
-- as an InitPlan instead of once per row.
create policy organizations_select_own
  on public.organizations for select to authenticated
  using (id = (select public.current_organization_id()));

create policy organizations_update_own
  on public.organizations for update to authenticated
  using (
    id = (select public.current_organization_id())
    and (select public.current_user_role()) in ('bid_manager', 'executive_approver')
  )
  with check (
    id = (select public.current_organization_id())
    and (select public.current_user_role()) in ('bid_manager', 'executive_approver')
  );

-- No INSERT or DELETE policy: organization creation and deletion are privileged
-- operations. Onboarding runs through a SECURITY DEFINER RPC in T1.4; deletion is
-- service_role only.

-- --- profiles policies ------------------------------------------------------
-- Team members can see each other so that assignment and approval UIs can render.
create policy profiles_select_same_org
  on public.profiles for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No INSERT or DELETE policy: profile provisioning is service_role / RPC only,
-- which prevents a user inventing a profile in someone else's organization.

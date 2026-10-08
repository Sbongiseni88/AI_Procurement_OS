-- ============================================================================
-- E1.5.2 step 2 — access follows the active membership.
--
-- Every policy now asks "which company is this person working in, through an
-- active membership?" instead of reading the company stored on the profile.
--
-- Active company
-- --------------
-- A person may have several active memberships. `profiles.active_organization_id`
-- records which one they chose, but it is only a preference: the helper below
-- picks among the person's ACTIVE memberships and uses the stored value solely to
-- order them. A stored value that does not match an active membership is ignored,
-- so access can never come from that column alone. With no valid choice, the
-- oldest active membership is used; with no active membership, the helper returns
-- NULL and every policy fails closed.
--
-- The helpers move to the `private` schema, which the API does not expose (the
-- old public ones were callable as /rest/v1/rpc/... endpoints, flagged by the
-- database advisors). Policies call them as the signed-in user, so
-- `authenticated` keeps EXECUTE on them.
--
-- The old profile columns (organization_id, role) stay, still written by
-- onboarding, until the app stops reading them; a later migration drops them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Catch-up backfill for anyone who onboarded between step 1 and this migration.
-- ----------------------------------------------------------------------------
insert into public.memberships (organization_id, user_id, role, status, created_at, updated_at)
select p.organization_id, p.id, p.role, 'active', p.created_at, p.created_at
from public.profiles p
on conflict (organization_id, user_id) do nothing;

update public.profiles
set active_organization_id = organization_id
where active_organization_id is null;

-- ----------------------------------------------------------------------------
-- Session helpers (SECURITY DEFINER: they read memberships, whose own policy
-- calls them, so running as the owner is what stops the recursion).
-- ----------------------------------------------------------------------------
create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.user_id = (select auth.uid())
    and m.status = 'active'
  order by
    (m.organization_id = p.active_organization_id) is true desc,
    m.created_at,
    m.organization_id
  limit 1;
$$;

comment on function private.current_organization_id() is
  'The company the caller works in: their chosen ACTIVE membership, else their oldest active one, else NULL.';

create or replace function private.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.organization_id = private.current_organization_id();
$$;

comment on function private.current_user_role() is
  'The caller''s role in the company returned by private.current_organization_id().';

revoke all on function private.current_organization_id() from public, anon;
revoke all on function private.current_user_role() from public, anon;
grant execute on function private.current_organization_id() to authenticated;
grant execute on function private.current_user_role() to authenticated;

-- ----------------------------------------------------------------------------
-- Every policy onto the membership helpers
-- ----------------------------------------------------------------------------
alter policy organizations_select_own on public.organizations
  using (id = (select private.current_organization_id()));

alter policy organizations_update_own on public.organizations
  using (
    id = (select private.current_organization_id())
    and (select private.current_user_role()) in ('bid_manager', 'executive_approver')
  )
  with check (
    id = (select private.current_organization_id())
    and (select private.current_user_role()) in ('bid_manager', 'executive_approver')
  );

alter policy audit_events_select_own_org on public.audit_events
  using (organization_id = (select private.current_organization_id()));

alter policy memberships_select_own_or_current_org on public.memberships
  using (
    user_id = (select auth.uid())
    or organization_id = (select private.current_organization_id())
  );

-- Profiles: yourself, plus everyone with a membership (of any status, so past
-- members still have a name in the history) in the company you are working in.
drop policy profiles_select_same_org on public.profiles;

create policy profiles_select_self_or_current_org
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.memberships m
      where m.user_id = profiles.id
        and m.organization_id = (select private.current_organization_id())
    )
  );

-- No policy depends on the public helpers any more (DROP would fail if one did).
drop function public.current_organization_id();
drop function public.current_user_role();

-- ----------------------------------------------------------------------------
-- Switching company: only to a company where the caller has an active membership.
-- Same layout as onboarding: DEFINER function in `private`, INVOKER wrapper in
-- `public`. Users hold no UPDATE privilege on active_organization_id.
-- ----------------------------------------------------------------------------
create or replace function private.set_active_organization(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Sign in before switching company.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.memberships
    where user_id = caller
      and organization_id = target
      and status = 'active'
  ) then
    raise exception 'You are not an active member of that company.' using errcode = '42501';
  end if;

  update public.profiles set active_organization_id = target where id = caller;
end;
$$;

comment on function private.set_active_organization(uuid) is
  'Switches the caller to another company in which they hold an active membership.';

revoke all on function private.set_active_organization(uuid) from public, anon;
grant execute on function private.set_active_organization(uuid) to authenticated;

create or replace function public.switch_organization(organization_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_active_organization(organization_id);
$$;

comment on function public.switch_organization(uuid) is
  'Entry point for switching company. See private.set_active_organization.';

revoke all on function public.switch_organization(uuid) from public, anon;
grant execute on function public.switch_organization(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Onboarding also creates the first membership and selects the new company.
-- The profile still gets organization_id and role until those columns go.
-- ----------------------------------------------------------------------------
create or replace function private.create_workspace(company_name text, full_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  clean_company text := nullif(regexp_replace(company_name, '^\s+|\s+$', '', 'g'), '');
  clean_name text := nullif(regexp_replace(full_name, '^\s+|\s+$', '', 'g'), '');
  new_org uuid;
begin
  if caller is null then
    raise exception 'Sign in before creating a workspace.' using errcode = '42501';
  end if;

  if clean_company is null or length(clean_company) > 200 then
    raise exception 'Company name must be 1 to 200 characters.' using errcode = '22023';
  end if;

  if clean_name is null or length(clean_name) > 200 then
    raise exception 'Your name must be 1 to 200 characters.' using errcode = '22023';
  end if;

  -- Once per person, as before. Joining further companies is by invitation (later).
  if exists (select 1 from public.profiles where id = caller)
    or exists (select 1 from public.memberships where user_id = caller) then
    raise exception 'This account already belongs to a workspace.' using errcode = '23505';
  end if;

  insert into public.organizations (name)
  values (clean_company)
  returning id into new_org;

  insert into public.profiles (id, organization_id, role, full_name, active_organization_id)
  values (caller, new_org, 'executive_approver', clean_name, new_org);

  insert into public.memberships (organization_id, user_id, role, status)
  values (new_org, caller, 'executive_approver', 'active');

  return new_org;
end;
$$;

revoke all on function private.create_workspace(text, text) from public, anon;
grant execute on function private.create_workspace(text, text) to authenticated;

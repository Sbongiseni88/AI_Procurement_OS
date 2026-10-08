-- ============================================================================
-- E1.5.2 step 4 — the profile is the person only.
--
-- Company and role now live in `memberships` and nothing reads them from the
-- profile any more (app, policies and helpers switched in the previous
-- migrations), so the one-company columns go. A profile keeps the person's name
-- and the company they last chose to work in.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Onboarding no longer writes the old columns.
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

  -- Once per person. `profiles.id` being the primary key backs this up under
  -- concurrency: the second of two simultaneous calls fails and rolls back.
  if exists (select 1 from public.profiles where id = caller)
    or exists (select 1 from public.memberships where user_id = caller) then
    raise exception 'This account already belongs to a workspace.' using errcode = '23505';
  end if;

  insert into public.organizations (name)
  values (clean_company)
  returning id into new_org;

  insert into public.profiles (id, full_name, active_organization_id)
  values (caller, clean_name, new_org);

  -- The person who creates the workspace is its most senior member.
  insert into public.memberships (organization_id, user_id, role, status)
  values (new_org, caller, 'executive_approver', 'active');

  return new_org;
end;
$$;

revoke all on function private.create_workspace(text, text) from public, anon;
grant execute on function private.create_workspace(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- The profile guard (T1.3) read `role` and `organization_id`; after the drop it
-- guards the selected company instead. Layer 1 is the column grant (users may
-- update only `full_name`); this trigger is layer 2, so a future broad grant still
-- cannot let someone point their selection anywhere without switch_organization,
-- whose SECURITY DEFINER body runs as the owner and passes.
-- ----------------------------------------------------------------------------
create or replace function public.forbid_self_privilege_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- SECURITY INVOKER on purpose: `current_user` must be the caller (see T1.3).
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.active_organization_id is distinct from old.active_organization_id then
    raise exception 'Switch company with switch_organization.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Co-members may read a person's name, not which company they last selected
-- (that would reveal another company they belong to). Column-level SELECT; the
-- app reads only `full_name`. Note: `select *` on profiles now fails for users.
-- ----------------------------------------------------------------------------
revoke select on public.profiles from authenticated;
grant select (id, full_name, created_at, updated_at) on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- Drop the one-company columns (their index goes with them).
-- ----------------------------------------------------------------------------
alter table public.profiles
  drop column organization_id,
  drop column role;

comment on table public.profiles is
  'The person: name and login identity, 1:1 with auth.users. Company and role live in memberships.';
comment on column public.profiles.active_organization_id is
  'The company the person last chose. A preference only: access comes from an active membership.';

-- ============================================================================
-- E1.4 — Onboarding: create a company workspace and its first member.
--
-- T1.3 denies INSERT on `organizations` and `profiles` to every user role, so a
-- new sign-up has no way to get a workspace. This adds exactly one way, with
-- these guarantees:
--
--   * It acts only on the caller (`auth.uid()`); there is no user id parameter.
--   * It only CREATES an organization; there is no organization id parameter, so
--     it cannot be used to join someone else's company.
--   * It runs once per user: a caller who already has a profile is refused, and
--     `profiles.id` being the primary key backs that up under concurrency (the
--     second of two simultaneous calls fails and its organization rolls back).
--   * Organization and profile are created in one transaction (one function call).
--
-- Layout (per the Supabase security checklist): the SECURITY DEFINER function
-- lives in `private`, a schema PostgREST does not expose, so it is not an API
-- endpoint by itself. `public.complete_onboarding` is a SECURITY INVOKER wrapper
-- that is the only route to it.
-- ============================================================================

create schema if not exists private;

-- Nothing in `private` is public. Signed-in users may resolve names in it so the
-- wrapper below can call into it; EXECUTE is granted per function.
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.create_workspace(company_name text, full_name text)
returns uuid
language plpgsql
security definer
-- Mandatory for SECURITY DEFINER: every name below is schema-qualified.
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  clean_company text := nullif(trim(company_name), '');
  clean_name text := nullif(trim(full_name), '');
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

  if exists (select 1 from public.profiles where id = caller) then
    raise exception 'This account already belongs to a workspace.' using errcode = '23505';
  end if;

  insert into public.organizations (name)
  values (clean_company)
  returning id into new_org;

  -- The person who creates the workspace is its most senior member. Later members
  -- are added by invitation (not in Phase 1) and default to bid_manager.
  insert into public.profiles (id, organization_id, role, full_name)
  values (caller, new_org, 'executive_approver', clean_name);

  return new_org;
end;
$$;

comment on function private.create_workspace(text, text) is
  'Onboarding: creates an organization and the caller''s profile in it. Once per user.';

revoke all on function private.create_workspace(text, text) from public;
grant execute on function private.create_workspace(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Public entry point (exposed through PostgREST as rpc/complete_onboarding).
-- SECURITY INVOKER: it has no privileges of its own; it only forwards.
-- ----------------------------------------------------------------------------
create or replace function public.complete_onboarding(company_name text, full_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_workspace(company_name, full_name);
$$;

comment on function public.complete_onboarding(text, text) is
  'Onboarding entry point for the app. See private.create_workspace.';

-- Supabase's default privileges grant EXECUTE on new public functions to anon.
revoke all on function public.complete_onboarding(text, text) from public, anon;
grant execute on function public.complete_onboarding(text, text) to authenticated;

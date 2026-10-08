-- ============================================================================
-- E1.4 follow-up — reject names that are only whitespace of any kind.
--
-- Postgres `trim()` strips spaces only, so a company or person name made of tabs
-- or newlines passed both `private.create_workspace` and the T1.3 check
-- constraint `length(trim(name)) > 0` when the RPC was called directly (the app's
-- Zod schema already trims all whitespace). That would create a workspace with an
-- invisible name.
-- ============================================================================

-- Table-level guard, which also covers later renames. `~ '\S'`: at least one
-- non-whitespace character. The T1.3 constraint stays; this one is stricter.
alter table public.organizations
  add constraint organizations_name_has_visible_text check (name ~ '\S');

create or replace function private.create_workspace(company_name text, full_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  -- Strip leading/trailing whitespace of every kind, not just spaces.
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

  if exists (select 1 from public.profiles where id = caller) then
    raise exception 'This account already belongs to a workspace.' using errcode = '23505';
  end if;

  insert into public.organizations (name)
  values (clean_company)
  returning id into new_org;

  insert into public.profiles (id, organization_id, role, full_name)
  values (caller, new_org, 'executive_approver', clean_name);

  return new_org;
end;
$$;

-- `create or replace` keeps the existing grants (EXECUTE to authenticated only);
-- restated here so this file reads correctly on its own.
revoke all on function private.create_workspace(text, text) from public;
grant execute on function private.create_workspace(text, text) to authenticated;

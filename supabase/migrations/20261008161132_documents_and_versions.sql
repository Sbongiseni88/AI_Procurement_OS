-- ============================================================================
-- E1.5.4 — documents and immutable, hashed versions; private file storage.
--
-- Every file in the system (a company document now, tender documents in E3) is a
-- `documents` row with one or more `document_versions`. A version records where
-- the file is stored, its SHA-256 hash, size, type, original name, who uploaded it
-- and when. Versions never change and are never deleted; a renewed certificate is
-- a new version, and the old one stays (Architecture rule 4).
--
-- Rules
--   * Read: members read their active company's documents, versions and files.
--   * Write: no user role writes any of it through the API. Files are hashed and
--     stored by one server helper (src/lib/documents/upload.ts) with the service
--     role, through `public.add_document_version`. If users could insert versions
--     they could record a hash that does not match the file.
--   * Change: versions are immutable for everyone, the service role and the table
--     owner included (trigger). Documents are archived (`archived_at`), never
--     deleted; both go only when their whole company is deleted.
--   * Files: private bucket `documents`, paths `{organization_id}/{document_id}/{version_id}`.
--     Members may read their company's folder; nobody may upload, overwrite or
--     delete through the API. (The service key can still delete objects through
--     the Storage API; Postgres cannot stop that, so no server code path does it
--     except removing a file whose version was never recorded.)
-- ============================================================================

create type public.document_kind as enum ('company', 'tender');

-- ----------------------------------------------------------------------------
-- A generic guard for rows that must never change: append-only logs and
-- immutable records. Raises on UPDATE, DELETE and TRUNCATE, even for the table
-- owner, except a DELETE that arrives through a foreign key cascade (one trigger
-- level deeper than a direct statement): records go with their company, never
-- row by row. Reused by later tables (domain events, AI runs).
-- ----------------------------------------------------------------------------
create or replace function private.forbid_row_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception '% rows cannot be changed or deleted.', tg_table_name using errcode = '42501';
end;
$$;

revoke all on function private.forbid_row_changes() from public;

-- ----------------------------------------------------------------------------
-- documents
-- ----------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.document_kind not null,
  title text not null check (title ~ '\S' and length(title) <= 300),
  -- Company DNA category (csd, tax, bbbee, cipc…); the list is defined in E2.
  category text check (category ~ '^[a-z][a-z0-9_]{0,59}$'),
  -- Set by add_document_version to the newest version; a foreign key below keeps it
  -- pointing at one of this document's own versions.
  current_version_id uuid,
  created_by uuid, -- no FK (table conventions, ARCHITECTURE.md §8)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  -- Lets document_versions reference (document, company) so a version can never
  -- sit in a different company from its document.
  constraint documents_id_organization_key unique (id, organization_id)
);

comment on table public.documents is
  'Any file in the system (company or tender document). Archived, never deleted.';

create index documents_organization_id_idx on public.documents (organization_id);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- Archive, don't delete: a document goes only with its company.
create trigger documents_no_delete
  before delete on public.documents
  for each row execute function private.forbid_row_changes();

create trigger documents_no_truncate
  before truncate on public.documents
  for each statement execute function private.forbid_row_changes();

-- ----------------------------------------------------------------------------
-- document_versions
-- ----------------------------------------------------------------------------
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  version_number integer not null check (version_number > 0),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes > 0),
  mime_type text not null check (mime_type ~ '^[a-z]+/[a-z0-9.+-]+$'),
  original_file_name text not null check (original_file_name ~ '\S' and length(original_file_name) <= 255),
  uploaded_by uuid, -- no FK (table conventions)
  uploaded_at timestamptz not null default now(),
  constraint document_versions_document_fkey
    foreign key (document_id, organization_id)
    references public.documents (id, organization_id) on delete cascade,
  constraint document_versions_number_key unique (document_id, version_number),
  -- For the documents.current_version_id foreign key below.
  constraint document_versions_id_document_key unique (id, document_id),
  -- The storage policy trusts the first folder of the path to be the company, so
  -- the path is fixed by the row's own ids.
  constraint document_versions_storage_path_check
    check (storage_path = organization_id::text || '/' || document_id::text || '/' || id::text)
);

comment on table public.document_versions is
  'Immutable file versions with SHA-256. Written only through add_document_version (service role).';

create index document_versions_document_organization_idx
  on public.document_versions (document_id, organization_id);
-- Duplicate detection: "has this company stored these exact bytes before?"
create index document_versions_organization_sha256_idx
  on public.document_versions (organization_id, sha256);

create trigger document_versions_immutable
  before update or delete on public.document_versions
  for each row execute function private.forbid_row_changes();

create trigger document_versions_no_truncate
  before truncate on public.document_versions
  for each statement execute function private.forbid_row_changes();

alter table public.documents
  add constraint documents_current_version_fkey
    foreign key (current_version_id, id)
    references public.document_versions (id, document_id);

create index documents_current_version_idx on public.documents (current_version_id, id);

-- ----------------------------------------------------------------------------
-- The one write path: create the document if needed, add the next version, make
-- it current. One transaction; the document row is locked so two uploads to the
-- same document cannot take the same version number. Service role only: the
-- server helper has already authorised the person, hashed the file and stored it
-- at the path this function records.
-- ----------------------------------------------------------------------------
create or replace function public.add_document_version(
  p_organization_id uuid,
  p_document_id uuid,
  p_version_id uuid,
  p_sha256 text,
  p_size_bytes bigint,
  p_mime_type text,
  p_original_file_name text,
  p_uploaded_by uuid,
  -- Set these three to create the document; leave NULL to add to an existing one.
  p_new_kind public.document_kind default null,
  p_new_title text default null,
  p_new_category text default null
)
returns public.document_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.documents;
  next_number integer;
  added public.document_versions;
begin
  if p_new_kind is not null then
    insert into public.documents (id, organization_id, kind, title, category, created_by)
    values (p_document_id, p_organization_id, p_new_kind, p_new_title, p_new_category, p_uploaded_by);
  end if;

  select * into target
  from public.documents
  where id = p_document_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Document not found in this company.' using errcode = 'P0002';
  end if;
  if target.archived_at is not null then
    raise exception 'An archived document cannot get a new version.' using errcode = '55000';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_number
  from public.document_versions
  where document_id = p_document_id;

  insert into public.document_versions (
    id, organization_id, document_id, version_number, storage_path,
    sha256, size_bytes, mime_type, original_file_name, uploaded_by
  )
  values (
    p_version_id, p_organization_id, p_document_id, next_number,
    p_organization_id::text || '/' || p_document_id::text || '/' || p_version_id::text,
    p_sha256, p_size_bytes, p_mime_type, p_original_file_name, p_uploaded_by
  )
  returning * into added;

  update public.documents set current_version_id = added.id where id = p_document_id;

  return added;
end;
$$;

comment on function public.add_document_version is
  'Records a stored file as the next version of a document (creating the document if asked). Service role only.';

revoke all on function public.add_document_version from public, anon, authenticated;
grant execute on function public.add_document_version to service_role;

-- ----------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ----------------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;

revoke all on public.documents from anon, authenticated, service_role;
revoke all on public.document_versions from anon, authenticated, service_role;

grant select on public.documents to authenticated;
grant select on public.document_versions to authenticated;
-- No DELETE for the service role either: documents are archived, versions kept.
grant select, insert, update on public.documents to service_role;
grant select, insert on public.document_versions to service_role;

create policy documents_select_own_org
  on public.documents for select to authenticated
  using (organization_id = (select private.current_organization_id()));

create policy document_versions_select_own_org
  on public.document_versions for select to authenticated
  using (organization_id = (select private.current_organization_id()));

-- No INSERT, UPDATE or DELETE policy for any user role (see the header).

-- ----------------------------------------------------------------------------
-- File storage: a private bucket, company folder first in every path.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800, -- 50 MB, the Supabase Free plan's upload limit
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Download, list and signed URLs: only inside the active company's folder. There
-- is deliberately no INSERT, UPDATE or DELETE policy on this bucket, so users can
-- neither upload, overwrite (upsert needs UPDATE) nor delete files directly.
create policy documents_bucket_read_own_company
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select private.current_organization_id())::text
  );

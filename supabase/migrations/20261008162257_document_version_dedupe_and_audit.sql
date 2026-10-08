-- ============================================================================
-- E1.5.4 follow-up (code review) — add_document_version checks duplicates and
-- writes its audit entry in the same transaction.
--
-- 1. Duplicates. The server helper checks for the same bytes before uploading,
--    but two uploads of the same file at the same moment both passed that check.
--    The function now takes a transaction-scoped lock on (company, hash) and
--    re-checks, so the second waits for the first and is refused with PT409
--    (PostgREST answers HTTP 409); the helper then removes its file and reports
--    the duplicate. Versions of archived documents no longer count: an archived
--    document must not block the same file from being stored again.
-- 2. Audit. The audit entry was written after the version, by a separate call; if
--    that call failed, a retry found a duplicate and the upload was never logged.
--    The entry is now written here, in the same transaction, for the version's own
--    company. Database functions that make a material change write their audit
--    row this way; everything else uses `recordAuditEvent`.
-- ============================================================================

create or replace function public.add_document_version(
  p_organization_id uuid,
  p_document_id uuid,
  p_version_id uuid,
  p_sha256 text,
  p_size_bytes bigint,
  p_mime_type text,
  p_original_file_name text,
  p_uploaded_by uuid,
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
  -- One upload of these bytes per company at a time (released at commit).
  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_sha256, 0)
  );

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

  if exists (
    select 1
    from public.document_versions v
    join public.documents d on d.id = v.document_id
    where v.organization_id = p_organization_id
      and v.sha256 = p_sha256
      and d.archived_at is null
  ) then
    raise exception 'This exact file is already stored in this company.' using errcode = 'PT409';
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

  -- No file name or contents in the details: a name can carry an ID number.
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, details)
  values (
    p_organization_id,
    p_uploaded_by,
    'document.uploaded',
    'document',
    p_document_id,
    jsonb_build_object(
      'versionId', added.id,
      'versionNumber', added.version_number,
      'sha256', added.sha256,
      'sizeBytes', added.size_bytes,
      'mimeType', added.mime_type
    )
  );

  return added;
end;
$$;

-- `create or replace` keeps the grants; restated so this file reads on its own.
revoke all on function public.add_document_version from public, anon, authenticated;
grant execute on function public.add_document_version to service_role;

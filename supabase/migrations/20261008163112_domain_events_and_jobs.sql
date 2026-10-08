-- ============================================================================
-- E1.5.5 — domain events and background jobs.
--
-- `domain_events` records what happened in the business (a document was
-- uploaded, a workspace created; later: a tender read, a requirement decided).
-- It is the log that jobs and future AI agents react to. Append-only.
--
-- `jobs` holds background work (Architecture rule 7): AI reading in E2/E3, and
-- future agents as new job types. A job runner (src/app/api/jobs/run) claims due
-- jobs with FOR UPDATE SKIP LOCKED, so two runners never take the same job, runs
-- the handler registered for the job's type, and retries with backoff up to
-- `max_attempts` before marking the job failed with its error.
--
-- Rules
--   * Read: members read their active company's events and jobs (a screen can
--     show "reading…").
--   * Write: service role only, through `record_domain_event` (an event and,
--     optionally, its job in one transaction) and `claim_jobs`; the runner then
--     updates the jobs it claimed. Users write nothing here.
--   * Events never change (shared `private.forbid_row_changes` trigger); jobs
--     change only by the runner and are kept, not deleted.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- domain_events
-- ----------------------------------------------------------------------------
create table public.domain_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- `<entity>.<past-tense verb>`, e.g. document.uploaded, tender.read.
  type text not null check (type ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z_]*$'),
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  -- No foreign key (table conventions). NULL: the system acted.
  actor_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.domain_events is
  'Append-only log of business events that jobs and future agents react to.';

create index domain_events_organization_created_idx
  on public.domain_events (organization_id, created_at desc);

create trigger domain_events_append_only
  before update or delete on public.domain_events
  for each row execute function private.forbid_row_changes();

create trigger domain_events_no_truncate
  before truncate on public.domain_events
  for each statement execute function private.forbid_row_changes();

-- ----------------------------------------------------------------------------
-- jobs
-- ----------------------------------------------------------------------------
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed');

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- A registered handler name, e.g. ping, document.read.
  type text not null check (type ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)*$'),
  status public.job_status not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  run_after timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  result jsonb,
  last_error text,
  -- When the current attempt was claimed; NULL unless running.
  locked_at timestamptz,
  finished_at timestamptz,
  -- The record the job works on (e.g. a document) and the event that queued it.
  entity_type text check (entity_type ~ '^[a-z][a-z_]*$'),
  entity_id uuid,
  event_id bigint references public.domain_events (id) on delete cascade,
  created_by uuid, -- no FK (table conventions)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_attempts_check check (attempts between 0 and max_attempts),
  constraint jobs_running_locked_check check ((status = 'running') = (locked_at is not null))
);

comment on table public.jobs is
  'Background work with retries. Written only by record_domain_event, claim_jobs and the job runner.';

-- What the runner asks for: due queued jobs, and running jobs whose runner died.
create index jobs_queued_run_after_idx on public.jobs (run_after) where status = 'queued';
create index jobs_running_locked_at_idx on public.jobs (locked_at) where status = 'running';
create index jobs_organization_created_idx on public.jobs (organization_id, created_at desc);
create index jobs_event_id_idx on public.jobs (event_id);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Recording an event, and optionally the job that reacts to it, in one
-- transaction. Service role only: the server helper derives the company and
-- actor from the session (src/lib/jobs/events.ts).
-- ----------------------------------------------------------------------------
create or replace function public.record_domain_event(
  p_organization_id uuid,
  p_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_actor_id uuid,
  p_job_type text default null,
  p_job_payload jsonb default null,
  p_job_max_attempts integer default null
)
returns table (event_id bigint, job_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_event bigint;
  new_job uuid;
begin
  insert into public.domain_events (organization_id, type, entity_type, entity_id, payload, actor_id)
  values (p_organization_id, p_type, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb), p_actor_id)
  returning id into new_event;

  if p_job_type is not null then
    insert into public.jobs (
      organization_id, type, payload, max_attempts, entity_type, entity_id, event_id, created_by
    )
    values (
      p_organization_id, p_job_type, coalesce(p_job_payload, '{}'::jsonb),
      coalesce(p_job_max_attempts, 3), p_entity_type, p_entity_id, new_event, p_actor_id
    )
    returning id into new_job;
  end if;

  return query select new_event, new_job;
end;
$$;

comment on function public.record_domain_event is
  'Records a domain event and optionally queues a job for it, atomically. Service role only.';

-- ----------------------------------------------------------------------------
-- Claiming due jobs. Each claimed job becomes `running`, gets its next attempt
-- number and a lock time; FOR UPDATE SKIP LOCKED lets several runners work at
-- once without taking the same job. A job still `running` after p_stale_after
-- had its runner die (e.g. a timed-out function): it is claimed again, or failed
-- if it has no attempts left.
-- ----------------------------------------------------------------------------
create or replace function public.claim_jobs(
  p_limit integer default 5,
  p_stale_after interval default interval '15 minutes'
)
returns setof public.jobs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Jobs that cannot run again: a dead runner's last attempt, or (defensively) a
  -- queued job with no attempts left.
  update public.jobs
  set status = 'failed',
      locked_at = null,
      finished_at = now(),
      last_error = coalesce(last_error || ' ', '') || 'Stopped: no attempts left.'
  where attempts >= max_attempts
    and (status = 'queued' or (status = 'running' and locked_at < now() - p_stale_after));

  return query
  update public.jobs j
  set status = 'running',
      attempts = j.attempts + 1,
      locked_at = now()
  where j.id in (
    select candidate.id
    from public.jobs candidate
    where candidate.attempts < candidate.max_attempts
      and (
        (candidate.status = 'queued' and candidate.run_after <= now())
        or (candidate.status = 'running' and candidate.locked_at < now() - p_stale_after)
      )
    order by candidate.run_after, candidate.created_at
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning j.*;
end;
$$;

comment on function public.claim_jobs is
  'Claims up to p_limit due jobs for one runner (FOR UPDATE SKIP LOCKED). Service role only.';

revoke all on function public.record_domain_event from public, anon, authenticated;
revoke all on function public.claim_jobs from public, anon, authenticated;
grant execute on function public.record_domain_event to service_role;
grant execute on function public.claim_jobs to service_role;

-- ----------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ----------------------------------------------------------------------------
alter table public.domain_events enable row level security;
alter table public.jobs enable row level security;

revoke all on public.domain_events from anon, authenticated, service_role;
revoke all on public.jobs from anon, authenticated, service_role;

grant select on public.domain_events to authenticated;
grant select on public.jobs to authenticated;
grant select, insert on public.domain_events to service_role;
-- The runner updates the jobs it claimed; jobs are kept, never deleted.
grant select, insert, update on public.jobs to service_role;

create policy domain_events_select_own_org
  on public.domain_events for select to authenticated
  using (organization_id = (select private.current_organization_id()));

create policy jobs_select_own_org
  on public.jobs for select to authenticated
  using (organization_id = (select private.current_organization_id()));

-- No INSERT, UPDATE or DELETE policy for any user role (see the header).

-- ----------------------------------------------------------------------------
-- Uploads are material changes, so the version's function also records the
-- `document.uploaded` domain event, in the same transaction as the audit entry
-- (Architecture rule 8). Same body as before plus that one insert.
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
  details jsonb;
begin
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

  -- No file name or contents: a name can carry an ID number.
  details := jsonb_build_object(
    'versionId', added.id,
    'versionNumber', added.version_number,
    'sha256', added.sha256,
    'sizeBytes', added.size_bytes,
    'mimeType', added.mime_type
  );

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, details)
  values (p_organization_id, p_uploaded_by, 'document.uploaded', 'document', p_document_id, details);

  insert into public.domain_events (organization_id, type, entity_type, entity_id, payload, actor_id)
  values (p_organization_id, 'document.uploaded', 'document', p_document_id, details, p_uploaded_by);

  return added;
end;
$$;

revoke all on function public.add_document_version from public, anon, authenticated;
grant execute on function public.add_document_version to service_role;

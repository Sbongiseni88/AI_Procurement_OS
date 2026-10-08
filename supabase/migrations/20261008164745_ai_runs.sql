-- ============================================================================
-- E1.5.6 — `ai_runs`: one row per AI gateway call.
--
-- Every call through the AI gateway (src/lib/ai/) is logged here, whatever its
-- outcome: which company, which job, which provider and model (and the model that
-- actually answered, if a refusal fallback took over), the task, tokens, an
-- estimated cost, how long it took, and how it ended. It is the basis for cost
-- tracking now and usage billing in the SaaS stage.
--
-- Rules
--   * Read: members read their active company's runs.
--   * Write: the gateway, with the service role. Users write nothing.
--   * Append-only for everyone (shared `private.forbid_row_changes` trigger); rows
--     go only with their company.
--   * No prompts, document contents or model output are stored here.
-- ============================================================================

create type public.ai_run_outcome as enum (
  'succeeded',
  'refused',
  'truncated',
  'invalid_output',
  'timed_out',
  'provider_error',
  'not_configured'
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- The background job that made the call, if any. A plain reference: jobs are
  -- never deleted, and a log row must not be rewritten or block anything.
  job_id uuid,
  -- e.g. read_company_document, read_tender (src/lib/ai/config.ts)
  task text not null check (task ~ '^[a-z][a-z_]*$'),
  provider text not null check (provider ~ '^[a-z][a-z0-9_]*$'),
  model text not null,
  -- The model that produced the answer; differs from `model` after a fallback.
  served_model text,
  outcome public.ai_run_outcome not null,
  error text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cache_read_tokens integer check (cache_read_tokens >= 0),
  cache_write_tokens integer check (cache_write_tokens >= 0),
  -- From the gateway's price table; NULL when the model's price is unknown.
  estimated_cost_usd numeric(12, 6) check (estimated_cost_usd >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  -- The person whose action caused the call; NULL for background work. No FK.
  created_by uuid,
  created_at timestamptz not null default now()
);

comment on table public.ai_runs is
  'Append-only log of every AI gateway call: model, task, tokens, cost, time, outcome.';

create index ai_runs_organization_created_idx on public.ai_runs (organization_id, created_at desc);
create index ai_runs_job_id_idx on public.ai_runs (job_id);

create trigger ai_runs_append_only
  before update or delete on public.ai_runs
  for each row execute function private.forbid_row_changes();

create trigger ai_runs_no_truncate
  before truncate on public.ai_runs
  for each statement execute function private.forbid_row_changes();

alter table public.ai_runs enable row level security;

revoke all on public.ai_runs from anon, authenticated, service_role;
grant select on public.ai_runs to authenticated;
grant select, insert on public.ai_runs to service_role;

create policy ai_runs_select_own_org
  on public.ai_runs for select to authenticated
  using (organization_id = (select private.current_organization_id()));

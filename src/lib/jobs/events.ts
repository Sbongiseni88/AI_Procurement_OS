import "server-only";

import { after } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type Database, type Json } from "@/lib/supabase/database.types";
import { requireMembership } from "@/lib/workspace/membership";

import { isJobType, type JobType } from "./handlers";
import { runJobsNow } from "./run";

/**
 * Domain events recorded through this helper, `<entity>.<past-tense verb>`, with the
 * entity type they concern. Database functions that make a material change record
 * their own event in the same transaction instead (`document.uploaded` by
 * `add_document_version`). Add new ones as tickets introduce them.
 */
const DOMAIN_EVENT_TYPES = ["workspace.created"] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

const ENTITY_TYPE: Record<DomainEventType, string> = {
  "workspace.created": "organization",
};

const EventInput = z.object({
  type: z.enum(DOMAIN_EVENT_TYPES),
  entityId: z.uuid(),
  payload: z.record(z.string(), z.json()),
});

/**
 * The one way the app records a domain event (Architecture rule 8) and queues the
 * background job that reacts to it (rule 7). Event and job are written in one
 * transaction (`record_domain_event`) with the service role; the company and actor
 * come from the session, never from the caller. When a job is queued, the runner is
 * started in this same function invocation right after the response is sent
 * (`after`), so the job does not wait for the daily cron.
 *
 * Payloads must never contain ID numbers, bank details or document contents.
 */
export async function recordDomainEvent(input: {
  type: DomainEventType;
  entityId: string;
  payload?: Record<string, Json>;
  job?: { type: JobType; payload?: Record<string, Json>; maxAttempts?: number };
}): Promise<{ eventId: number; jobId: string | null }> {
  const event = EventInput.parse({ payload: {}, ...input });
  const job = input.job;
  if (job !== undefined && !isJobType(job.type)) {
    throw new Error(`Unknown job type: ${job.type}`);
  }
  const membership = await requireMembership();

  const args: Database["public"]["Functions"]["record_domain_event"]["Args"] = {
    p_organization_id: membership.organization.id,
    p_type: event.type,
    p_entity_type: ENTITY_TYPE[event.type],
    p_entity_id: event.entityId,
    p_payload: event.payload,
    p_actor_id: membership.userId,
  };
  if (job !== undefined) {
    args.p_job_type = job.type;
    args.p_job_payload = job.payload ?? {};
    if (job.maxAttempts !== undefined) args.p_job_max_attempts = job.maxAttempts;
  }
  const { data, error } = await createSupabaseAdminClient()
    .rpc("record_domain_event", args)
    .single();
  if (error) throw new Error(`Domain event ${event.type} was not recorded: ${error.message}`);

  if (data.job_id !== null) after(runJobsNow);
  return { eventId: data.event_id, jobId: data.job_id };
}

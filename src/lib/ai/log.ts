import { type SupabaseClient } from "@supabase/supabase-js";

import { type Database } from "@/lib/supabase/database.types";

import { type AiRunLog } from "./gateway.ts";

/**
 * `ai_runs` as the gateway's log. Written with the service role (users cannot insert
 * into `ai_runs`); the organization comes from the gateway request, which takes it
 * from the session or the job, never from user input.
 */
export function createAiRunLog(db: SupabaseClient<Database>): AiRunLog {
  return {
    async record(entry) {
      const { error } = await db.from("ai_runs").insert({
        organization_id: entry.organizationId,
        job_id: entry.jobId,
        created_by: entry.createdBy,
        task: entry.task,
        provider: entry.provider,
        model: entry.model,
        served_model: entry.servedModel,
        outcome: entry.outcome,
        error: entry.error,
        input_tokens: entry.usage?.inputTokens ?? null,
        output_tokens: entry.usage?.outputTokens ?? null,
        cache_read_tokens: entry.usage?.cacheReadTokens ?? null,
        cache_write_tokens: entry.usage?.cacheWriteTokens ?? null,
        estimated_cost_usd: entry.estimatedCostUsd,
        latency_ms: entry.latencyMs,
      });
      if (error) throw new Error(error.message);
    },
  };
}

import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type Database } from "@/lib/supabase/database.types";

import { type ClaimedJob, type JobStore } from "./runner";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

function toClaimedJob(row: JobRow): ClaimedJob {
  return {
    id: row.id,
    organizationId: row.organization_id,
    type: row.type,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  };
}

/**
 * The jobs table as the runner's store, through the service role (the runner works
 * across companies). Every update is fenced on `status = running` and the attempt it
 * claimed, so a runner that was presumed dead and replaced cannot overwrite the newer
 * attempt's outcome.
 */
export function createJobStore(): JobStore {
  const db = createSupabaseAdminClient();

  async function settle(job: ClaimedJob, changes: Database["public"]["Tables"]["jobs"]["Update"]) {
    const { error } = await db
      .from("jobs")
      .update({ ...changes, locked_at: null })
      .eq("id", job.id)
      .eq("status", "running")
      .eq("attempts", job.attempts);
    if (error) throw new Error(`Job ${job.id} could not be updated: ${error.message}`);
  }

  return {
    async claim(limit) {
      const { data, error } = await db.rpc("claim_jobs", { p_limit: limit });
      if (error) throw new Error(`Claiming jobs failed: ${error.message}`);
      return data.map(toClaimedJob);
    },
    succeed: (job, result) =>
      settle(job, {
        status: "succeeded",
        result,
        last_error: null,
        finished_at: new Date().toISOString(),
      }),
    retry: (job, error, runAfter) =>
      settle(job, { status: "queued", last_error: error, run_after: runAfter.toISOString() }),
    fail: (job, error) =>
      settle(job, { status: "failed", last_error: error, finished_at: new Date().toISOString() }),
    async nextRunAfter() {
      const { data, error } = await db
        .from("jobs")
        .select("run_after")
        .eq("status", "queued")
        .order("run_after")
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Reading the job queue failed: ${error.message}`);
      return data === null ? null : new Date(data.run_after);
    },
  };
}

import "server-only";

import { JOB_HANDLERS } from "./handlers";
import { type DrainSummary, drainJobs } from "./runner";
import { createJobStore } from "./store";

/**
 * Runs due jobs now, across every company, within the time budget of one function
 * invocation (Vercel Hobby: 300 s; the runner stops claiming well before). Called by
 * the runner route (cron and manual kicks) and, through `after`, right after a job is
 * queued. Never throws: a failure is logged and the next kick tries again.
 */
export async function runJobsNow(): Promise<DrainSummary | null> {
  try {
    return await drainJobs(createJobStore(), JOB_HANDLERS);
  } catch (error: unknown) {
    console.error(
      `Job runner stopped: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return null;
  }
}

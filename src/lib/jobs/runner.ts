import type { z } from "zod";

import type { Json } from "../supabase/database.types";

/**
 * The job runner's logic (E1.5.5), free of Next.js and Supabase so it can be unit-
 * tested with an in-memory store (`tests/unit/jobs-runner.test.ts`). The database
 * store is `./store.ts`; the route that runs it is `src/app/api/jobs/run/route.ts`.
 */

/** A job the store has just claimed: `attempts` already counts this attempt. */
export type ClaimedJob = {
  id: string;
  organizationId: string;
  type: string;
  payload: Json;
  attempts: number;
  maxAttempts: number;
};

export interface JobStore {
  /** Claims up to `limit` due jobs (FOR UPDATE SKIP LOCKED in the database). */
  claim(limit: number): Promise<ClaimedJob[]>;
  succeed(job: ClaimedJob, result: Json): Promise<void>;
  /** Back to the queue, to run again at `runAfter`. */
  retry(job: ClaimedJob, error: string, runAfter: Date): Promise<void>;
  fail(job: ClaimedJob, error: string): Promise<void>;
  /** When the next queued job becomes due, or null if none is queued. */
  nextRunAfter(): Promise<Date | null>;
}

export type JobContext = {
  jobId: string;
  organizationId: string;
  attempt: number;
  /** Aborted when the handler's time is up; pass it to fetches and AI calls. */
  signal: AbortSignal;
};

/** A handler as the runner sees it: it parses its own payload. */
export type JobHandler = {
  timeoutMs: number;
  handle(payload: unknown, context: JobContext): Promise<Json>;
};

export type JobHandlers = Readonly<Record<string, JobHandler>>;

/** A failure that retrying cannot fix (bad payload, unknown type): fail at once. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export const DEFAULT_HANDLER_TIMEOUT_MS = 60_000;

/**
 * Wraps a handler with its payload schema. A payload that does not match is a
 * permanent failure: running it again would fail the same way.
 */
export function defineJobHandler<S extends z.ZodType>(definition: {
  payload: S;
  timeoutMs?: number;
  run(payload: z.output<S>, context: JobContext): Promise<Json>;
}): JobHandler {
  return {
    timeoutMs: definition.timeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS,
    async handle(payload, context) {
      const parsed = definition.payload.safeParse(payload);
      if (!parsed.success) throw new PermanentJobError("The job's payload is not valid.");
      return definition.run(parsed.data, context);
    },
  };
}

const RETRY_BASE_MS = 30_000;
const RETRY_CAP_MS = 30 * 60_000;

/** Exponential backoff after a failed attempt: 30 s, 60 s, 120 s, … capped at 30 min. */
export function retryDelayMs(failedAttempt: number): number {
  const exponent = Math.max(0, failedAttempt - 1);
  return Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_CAP_MS);
}

/** Errors are stored and shown to people: short, and never a stack trace. */
function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "The job failed.";
  return message.length > 500 ? `${message.slice(0, 497)}…` : message;
}

export type JobOutcome = "succeeded" | "retrying" | "failed";

/** Runs one claimed job to an outcome and records it. Never throws for job errors. */
export async function runClaimedJob(
  job: ClaimedJob,
  handlers: JobHandlers,
  store: JobStore,
  now: () => Date = () => new Date(),
): Promise<JobOutcome> {
  const handler = handlers[job.type];
  if (handler === undefined) {
    await store.fail(job, `No handler is registered for job type "${job.type}".`);
    return "failed";
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timed out after ${Math.round(handler.timeoutMs / 1000)} s.`));
    }, handler.timeoutMs);
  });

  try {
    const result = await Promise.race([
      handler.handle(job.payload, {
        jobId: job.id,
        organizationId: job.organizationId,
        attempt: job.attempts,
        signal: controller.signal,
      }),
      timeout,
    ]);
    await store.succeed(job, result);
    return "succeeded";
  } catch (error: unknown) {
    const message = errorMessage(error);
    if (error instanceof PermanentJobError || job.attempts >= job.maxAttempts) {
      await store.fail(job, message);
      return "failed";
    }
    await store.retry(job, message, new Date(now().getTime() + retryDelayMs(job.attempts)));
    return "retrying";
  } finally {
    clearTimeout(timer);
  }
}

export type DrainOptions = {
  /** Jobs claimed per round. */
  batchSize?: number;
  /** Stop claiming once this much time has passed (stay inside the function's limit). */
  budgetMs?: number;
  /** Wait for a retry due within this long instead of leaving it to the next kick. */
  maxWaitMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

export type DrainSummary = { succeeded: number; retrying: number; failed: number };

/**
 * Runs due jobs until none are left, waiting briefly for retries that fall due soon,
 * within a time budget. Each claim takes only as many jobs as could all finish inside
 * the budget at their longest. Jobs left over run at the next kick (after an enqueue)
 * or the daily cron.
 */
export async function drainJobs(
  store: JobStore,
  handlers: JobHandlers,
  options: DrainOptions = {},
): Promise<DrainSummary> {
  const {
    batchSize = 5,
    budgetMs = 200_000,
    maxWaitMs = 60_000,
    now = () => new Date(),
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  } = options;
  const longestHandlerMs = Math.max(
    DEFAULT_HANDLER_TIMEOUT_MS,
    ...Object.values(handlers).map((h) => h.timeoutMs),
  );
  const started = now().getTime();
  const elapsed = () => now().getTime() - started;
  const summary: DrainSummary = { succeeded: 0, retrying: 0, failed: 0 };

  for (;;) {
    // Claim only as many jobs as could all still finish inside the budget, even if
    // each ran to its timeout: a claimed job that never runs would lose an attempt.
    const room = Math.floor((budgetMs - elapsed()) / longestHandlerMs);
    if (room < 1) break;
    const claimed = await store.claim(Math.min(batchSize, room));
    if (claimed.length > 0) {
      for (const job of claimed) {
        summary[await runClaimedJob(job, handlers, store, now)] += 1;
      }
      continue;
    }

    const next = await store.nextRunAfter();
    if (next === null) break;
    const waitMs = Math.max(0, next.getTime() - now().getTime());
    if (waitMs > maxWaitMs || elapsed() + waitMs + longestHandlerMs > budgetMs) break;
    await sleep(waitMs);
  }
  return summary;
}

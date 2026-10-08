import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import {
  type ClaimedJob,
  defineJobHandler,
  drainJobs,
  type JobHandler,
  type JobStore,
  PermanentJobError,
  retryDelayMs,
  runClaimedJob,
} from "../../src/lib/jobs/runner.ts";

type Json = ClaimedJob["payload"];

/** A fake clock: time moves only when a test (or the runner's sleep) moves it. */
function fakeClock(start = Date.parse("2026-10-12T08:00:00Z")) {
  let current = start;
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
    sleep: async (ms: number) => {
      current += ms;
    },
  };
}

type StoredJob = {
  id: string;
  type: string;
  payload: Json;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lastError: string | null;
  result: Json | null;
};

/** The jobs table in memory, claiming due jobs the way `claim_jobs` does. */
function memoryStore(clock: ReturnType<typeof fakeClock>, jobs: StoredJob[]): JobStore {
  const find = (job: ClaimedJob) => {
    const row = jobs.find((j) => j.id === job.id);
    if (row === undefined) throw new Error(`no job ${job.id}`);
    return row;
  };
  return {
    async claim(limit) {
      const due = jobs
        .filter((j) => j.status === "queued" && j.runAfter <= clock.now())
        .slice(0, limit);
      return due.map((j) => {
        j.status = "running";
        j.attempts += 1;
        return {
          id: j.id,
          organizationId: "org",
          type: j.type,
          payload: j.payload,
          attempts: j.attempts,
          maxAttempts: j.maxAttempts,
        };
      });
    },
    async succeed(job, result) {
      Object.assign(find(job), { status: "succeeded", result, lastError: null });
    },
    async retry(job, error, runAfter) {
      Object.assign(find(job), { status: "queued", lastError: error, runAfter });
    },
    async fail(job, error) {
      Object.assign(find(job), { status: "failed", lastError: error });
    },
    async nextRunAfter() {
      const queued = jobs.filter((j) => j.status === "queued").map((j) => j.runAfter.getTime());
      return queued.length === 0 ? null : new Date(Math.min(...queued));
    },
  };
}

function queuedJob(overrides: Partial<StoredJob> = {}): StoredJob {
  return {
    id: "job-1",
    type: "ping",
    payload: {},
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    runAfter: new Date(0),
    lastError: null,
    result: null,
    ...overrides,
  };
}

/** A handler that fails the first `failures` times it runs, then succeeds. */
function flaky(failures: number): JobHandler & { calls: number } {
  const handler = {
    calls: 0,
    timeoutMs: 1_000,
    async handle() {
      handler.calls += 1;
      if (handler.calls <= failures) throw new Error(`failure ${handler.calls}`);
      return { ok: true };
    },
  };
  return handler;
}

describe("retryDelayMs", () => {
  it("doubles from 30 seconds and stops at 30 minutes", () => {
    assert.deepEqual(
      [1, 2, 3, 4].map((attempt) => retryDelayMs(attempt)),
      [30_000, 60_000, 120_000, 240_000],
    );
    assert.equal(retryDelayMs(20), 30 * 60_000);
  });
});

describe("runClaimedJob", () => {
  async function runOnce(handlers: Record<string, JobHandler>, job: StoredJob) {
    const clock = fakeClock();
    const store = memoryStore(clock, [job]);
    const [claimed] = await store.claim(1);
    if (claimed === undefined) throw new Error("nothing claimed");
    const outcome = await runClaimedJob(claimed, handlers, store, clock.now);
    return { outcome, job, clock };
  }

  it("records the handler's result when it succeeds", async () => {
    const { outcome, job } = await runOnce({ ping: flaky(0) }, queuedJob());
    assert.equal(outcome, "succeeded");
    assert.equal(job.status, "succeeded");
    assert.deepEqual(job.result, { ok: true });
  });

  it("puts a failed job back in the queue with backoff while attempts are left", async () => {
    const { outcome, job, clock } = await runOnce({ ping: flaky(1) }, queuedJob());
    assert.equal(outcome, "retrying");
    assert.equal(job.status, "queued");
    assert.equal(job.lastError, "failure 1");
    assert.equal(job.runAfter.getTime() - clock.now().getTime(), 30_000);
  });

  it("marks the job failed, with its error, on the last attempt", async () => {
    const { outcome, job } = await runOnce(
      { ping: flaky(5) },
      queuedJob({ attempts: 2, maxAttempts: 3 }),
    );
    assert.equal(outcome, "failed");
    assert.equal(job.status, "failed");
    assert.equal(job.attempts, 3);
    assert.equal(job.lastError, "failure 1");
  });

  it("fails at once, without retrying, on a permanent error", async () => {
    const permanent: JobHandler = {
      timeoutMs: 1_000,
      async handle() {
        throw new PermanentJobError("cannot ever work");
      },
    };
    const { outcome, job } = await runOnce({ ping: permanent }, queuedJob());
    assert.equal(outcome, "failed");
    assert.equal(job.attempts, 1);
    assert.equal(job.lastError, "cannot ever work");
  });

  it("fails a job whose type has no handler", async () => {
    const { outcome, job } = await runOnce({}, queuedJob({ type: "tender.read" }));
    assert.equal(outcome, "failed");
    assert.match(job.lastError ?? "", /No handler is registered for job type "tender.read"/);
  });

  it("fails a job whose payload does not match its handler's schema, without retrying", async () => {
    const strict = defineJobHandler({
      payload: z.object({ documentId: z.uuid() }),
      async run() {
        return { ok: true };
      },
    });
    const { outcome, job } = await runOnce(
      { ping: strict },
      queuedJob({ payload: { documentId: 7 } }),
    );
    assert.equal(outcome, "failed");
    assert.equal(job.lastError, "The job's payload is not valid.");
  });

  it("gives up on a handler that runs past its timeout, aborts it, and retries", async () => {
    let aborted = false;
    const slow: JobHandler = {
      timeoutMs: 20,
      handle: (_payload, context) =>
        new Promise<Json>((resolve) => {
          context.signal.addEventListener("abort", () => {
            aborted = true;
          });
          setTimeout(() => resolve({ late: true }), 200);
        }),
    };
    const { outcome, job } = await runOnce({ ping: slow }, queuedJob());
    assert.equal(outcome, "retrying");
    assert.equal(aborted, true);
    assert.equal(job.lastError, "Timed out after 0 s.");
  });
});

describe("drainJobs", () => {
  it("runs every due job and waits for a retry that falls due soon", async () => {
    const clock = fakeClock();
    const handler = flaky(1);
    const jobs = [queuedJob({ id: "a" }), queuedJob({ id: "b", type: "other" })];
    const summary = await drainJobs(
      memoryStore(clock, jobs),
      { ping: handler, other: flaky(0) },
      {
        now: clock.now,
        sleep: clock.sleep,
      },
    );
    assert.deepEqual(summary, { succeeded: 2, retrying: 1, failed: 0 });
    assert.equal(handler.calls, 2);
    assert.deepEqual(
      jobs.map((j) => j.status),
      ["succeeded", "succeeded"],
    );
  });

  it("leaves a retry due later than it will wait for the next kick", async () => {
    const clock = fakeClock();
    const jobs = [queuedJob({ attempts: 3, maxAttempts: 5 })];
    // Fourth attempt fails: the next one is due in 4 minutes, beyond the 1-minute wait.
    const summary = await drainJobs(
      memoryStore(clock, jobs),
      { ping: flaky(1) },
      {
        now: clock.now,
        sleep: clock.sleep,
      },
    );
    assert.deepEqual(summary, { succeeded: 0, retrying: 1, failed: 0 });
    assert.equal(jobs[0]?.status, "queued");
  });

  it("claims only as many jobs as can finish inside the budget at their longest", async () => {
    const clock = fakeClock();
    const claims: number[] = [];
    const jobs = ["a", "b", "c", "d"].map((id) => queuedJob({ id }));
    const store = memoryStore(clock, jobs);
    const counting: JobStore = {
      ...store,
      claim: async (limit) => {
        claims.push(limit);
        return store.claim(limit);
      },
    };
    // Every job takes its full minute.
    const slow: JobHandler = {
      timeoutMs: 60_000,
      async handle() {
        clock.advance(60_000);
        return {};
      },
    };
    const summary = await drainJobs(
      counting,
      { ping: slow },
      {
        now: clock.now,
        sleep: clock.sleep,
        budgetMs: 150_000,
      },
    );
    // 150 s fits two one-minute jobs; after them 30 s is left, too little for a third.
    assert.deepEqual(claims, [2]);
    assert.deepEqual(summary, { succeeded: 2, retrying: 0, failed: 0 });
    assert.deepEqual(
      jobs.map((j) => j.status),
      ["succeeded", "succeeded", "queued", "queued"],
    );
  });

  it("stops claiming when a handler could no longer finish inside the budget", async () => {
    const clock = fakeClock();
    const jobs = [queuedJob()];
    const summary = await drainJobs(
      memoryStore(clock, jobs),
      { ping: flaky(0) },
      {
        now: clock.now,
        sleep: clock.sleep,
        budgetMs: 30_000, // less than the 60 s a handler may take
      },
    );
    assert.deepEqual(summary, { succeeded: 0, retrying: 0, failed: 0 });
    assert.equal(jobs[0]?.status, "queued");
  });
});

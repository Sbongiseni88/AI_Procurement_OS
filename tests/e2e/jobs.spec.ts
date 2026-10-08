import { randomUUID } from "node:crypto";

import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { adminClient, deleteOrganization } from "./support/users";

/**
 * Domain events and the job runner (E1.5.5), end to end against the running app and
 * the real database: queue a `ping` job the way `recordDomainEvent` does (one
 * `record_domain_event` call), kick the runner route as Vercel Cron would, and read
 * the outcome. The retry and backoff logic is unit-tested (tests/unit/jobs-runner).
 */
const RUNNER = "/api/jobs/run";
const secret = process.env.CRON_SECRET;

const JobRow = z.object({
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  attempts: z.number(),
  result: z.unknown(),
  last_error: z.string().nullable(),
  locked_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});

async function queuePing(organizationId: string, payload: Record<string, string>) {
  const { data, error } = await adminClient()
    .rpc("record_domain_event", {
      p_organization_id: organizationId,
      p_type: "workspace.created",
      p_entity_type: "organization",
      p_entity_id: organizationId,
      p_payload: {},
      p_actor_id: null,
      p_job_type: "ping",
      p_job_payload: payload,
      p_job_max_attempts: 1,
    })
    .single();
  if (error) throw new Error(`queueing failed: ${error.message}`);
  return z.object({ event_id: z.number(), job_id: z.uuid() }).parse(data).job_id;
}

async function readJob(jobId: string) {
  const { data, error } = await adminClient()
    .from("jobs")
    .select("status, attempts, result, last_error, locked_at, finished_at")
    .eq("id", jobId)
    .single();
  if (error) throw new Error(`job read failed: ${error.message}`);
  return JobRow.parse(data);
}

test("the job runner refuses requests without the secret", async ({ request }) => {
  const none = await request.get(RUNNER);
  const wrong = await request.get(RUNNER, { headers: { Authorization: "Bearer not-the-secret" } });
  // 401 with a secret configured; 503 on a deployment that has none yet.
  expect([401, 503]).toContain(none.status());
  expect([401, 503]).toContain(wrong.status());
});

test.describe("with the runner secret", () => {
  test.skip(!secret, "CRON_SECRET is not set for this target");
  let organizationId = "";

  test.beforeEach(async () => {
    const { data, error } = await adminClient()
      .from("organizations")
      .insert({ name: `E2E Jobs ${randomUUID().slice(0, 8)}` })
      .select("id")
      .single();
    if (error) throw new Error(`organization insert failed: ${error.message}`);
    organizationId = z.object({ id: z.uuid() }).parse(data).id;
  });
  test.afterEach(async () => {
    // Its events and jobs go with it (cascade).
    if (organizationId) await deleteOrganization(organizationId);
  });

  async function kickRunner(request: APIRequestContext) {
    const response = await request.get(RUNNER, {
      headers: { Authorization: `Bearer ${secret}` },
      timeout: 120_000,
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }

  test("a queued ping job runs to succeeded", async ({ request }) => {
    const jobId = await queuePing(organizationId, {});
    expect((await readJob(jobId)).status).toBe("queued");

    await kickRunner(request);
    // Another worker's kick may have taken it first; either way it ends succeeded.
    await expect.poll(async () => (await readJob(jobId)).status).toBe("succeeded");
    const job = await readJob(jobId);
    expect(job).toMatchObject({
      attempts: 1,
      result: { pong: true },
      last_error: null,
      locked_at: null,
    });
    expect(job.finished_at).not.toBeNull();
  });

  test("a failing ping job is marked failed with its error", async ({ request }) => {
    const jobId = await queuePing(organizationId, { fail: "permanent" });

    await kickRunner(request);
    await expect.poll(async () => (await readJob(jobId)).status).toBe("failed");
    expect(await readJob(jobId)).toMatchObject({
      attempts: 1,
      last_error: "Ping was asked to fail.",
      locked_at: null,
    });
  });
});

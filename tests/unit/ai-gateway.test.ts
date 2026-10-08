import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import {
  AI_TASKS,
  type AiRoute,
  type AiTaskName,
  estimateCostUsd,
} from "../../src/lib/ai/config.ts";
import { type AiRunLogEntry, runAiTask } from "../../src/lib/ai/gateway.ts";
import { createFakeProvider, FAKE_USAGE, type FakeReply } from "../../src/lib/ai/providers/fake.ts";
import { AiError, type AiProvider } from "../../src/lib/ai/types.ts";

const Stamp = z.object({
  office: z.string(),
  date: z.iso.date().nullable(),
});

const ORG = "11111111-1111-4111-8111-111111111111";

function memoryLog() {
  const entries: AiRunLogEntry[] = [];
  return { entries, log: { record: async (entry: AiRunLogEntry) => void entries.push(entry) } };
}

async function run(
  reply: FakeReply | AiProvider,
  options: { routes?: Record<AiTaskName, AiRoute>; noProvider?: boolean } = {},
) {
  const { entries, log } = memoryLog();
  const provider = "generate" in reply ? reply : createFakeProvider(reply);
  const attempt = runAiTask(
    {
      providers: options.noProvider ? {} : { anthropic: provider },
      log,
      ...(options.routes ? { routes: options.routes } : {}),
    },
    {
      task: "connectivity_check",
      organizationId: ORG,
      jobId: "22222222-2222-4222-8222-222222222222",
      instructions: "Read the stamp.",
      prompt: "What does the stamp say?",
      output: Stamp,
    },
  );
  return { attempt, entries, provider };
}

async function rejection(attempt: Promise<unknown>): Promise<AiError> {
  try {
    await attempt;
  } catch (error: unknown) {
    if (error instanceof AiError) return error;
    throw error;
  }
  throw new Error("expected the task to fail");
}

describe("runAiTask", () => {
  it("returns the validated answer and logs the run with tokens and cost", async () => {
    const { attempt, entries, provider } = await run({
      status: "completed",
      output: { office: "SAPS Pretoria Central", date: "2026-01-21" },
    });
    const result = await attempt;
    assert.deepEqual(result.output, { office: "SAPS Pretoria Central", date: "2026-01-21" });
    assert.equal(result.run.servedModel, "claude-opus-5-5");

    // The route decided model, effort and limits, not the caller.
    const [request] = (provider as ReturnType<typeof createFakeProvider>).requests;
    assert.equal(request?.model, AI_TASKS.connectivity_check.model);
    assert.equal(request?.effort, AI_TASKS.connectivity_check.effort);
    assert.equal(request?.maxOutputTokens, AI_TASKS.connectivity_check.maxOutputTokens);

    assert.equal(entries.length, 1);
    assert.deepEqual(
      { ...entries[0], latencyMs: 0 },
      {
        organizationId: ORG,
        jobId: "22222222-2222-4222-8222-222222222222",
        createdBy: null,
        task: "connectivity_check",
        provider: "anthropic",
        model: "claude-opus-5-5",
        servedModel: "claude-opus-5-5",
        outcome: "succeeded",
        error: null,
        usage: FAKE_USAGE,
        estimatedCostUsd: 0.008,
        latencyMs: 0,
      },
    );
  });

  it("refuses an answer that does not match the schema, naming fields but not values", async () => {
    const { attempt, entries } = await run({
      status: "completed",
      output: { office: "SAPS", date: "21 January 2026", idNumber: "8001015009087" },
    });
    const error = await rejection(attempt);
    assert.equal(error.code, "invalid_output");
    assert.equal(error.retryable, true);
    assert.match(error.message, /at: date/);
    assert.doesNotMatch(error.message, /January|8001015009087/);
    assert.equal(entries[0]?.outcome, "invalid_output");
  });

  it("reports a refusal, which retrying will not fix", async () => {
    const { attempt, entries } = await run({ status: "refused", reason: "cyber" });
    const error = await rejection(attempt);
    assert.equal(error.code, "refused");
    assert.equal(error.retryable, false);
    assert.equal(entries[0]?.outcome, "refused");
    assert.deepEqual(entries[0]?.usage, FAKE_USAGE);
  });

  it("reports an answer cut off at the output limit", async () => {
    const { attempt, entries } = await run({ status: "truncated" });
    const error = await rejection(attempt);
    assert.equal(error.code, "truncated");
    assert.equal(entries[0]?.outcome, "truncated");
  });

  it("stops a provider that runs past the task's timeout, aborting its request", async () => {
    const routes = {
      ...AI_TASKS,
      connectivity_check: { ...AI_TASKS.connectivity_check, timeoutMs: 20 },
    };
    const { attempt, entries, provider } = await run({ status: "hang" }, { routes });
    const error = await rejection(attempt);
    assert.equal(error.code, "timed_out");
    assert.equal(error.retryable, true);
    assert.equal(
      (provider as ReturnType<typeof createFakeProvider>).requests[0]?.signal.aborted,
      true,
    );
    assert.equal(entries[0]?.outcome, "timed_out");
    assert.equal(entries[0]?.usage, null);
  });

  it("fails fast with a clear message when no API key is configured", async () => {
    const { attempt, entries } = await run({ status: "truncated" }, { noProvider: true });
    const error = await rejection(attempt);
    assert.equal(error.code, "not_configured");
    assert.equal(error.retryable, false);
    assert.match(error.message, /ANTHROPIC_API_KEY/);
    assert.equal(entries[0]?.outcome, "not_configured");
  });

  it("keeps a provider error's retry advice, and wraps anything else as retryable", async () => {
    const permanent: AiProvider = {
      name: "broken",
      async generate() {
        throw new AiError("provider_error", "bad request", false);
      },
    };
    const flaky: AiProvider = {
      name: "flaky",
      async generate() {
        throw new Error("socket hang up");
      },
    };
    const first = await rejection((await run(permanent)).attempt);
    assert.deepEqual([first.code, first.retryable], ["provider_error", false]);
    const { attempt, entries } = await run(flaky);
    const second = await rejection(attempt);
    assert.deepEqual(
      [second.code, second.retryable, second.message],
      ["provider_error", true, "socket hang up"],
    );
    assert.equal(entries[0]?.outcome, "provider_error");
  });

  it("still returns the answer when the run log cannot be written", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const result = await runAiTask(
        {
          providers: {
            anthropic: createFakeProvider({
              status: "completed",
              output: { office: "SAPS", date: null },
            }),
          },
          log: {
            record: async () => {
              throw new Error("database unavailable");
            },
          },
        },
        {
          task: "connectivity_check",
          organizationId: ORG,
          instructions: "",
          prompt: "",
          output: Stamp,
        },
      );
      assert.deepEqual(result.output, { office: "SAPS", date: null });
    } finally {
      console.error = original;
    }
  });
});

describe("estimateCostUsd", () => {
  it("prices input, output and cache tokens per model", () => {
    assert.equal(
      estimateCostUsd("claude-opus-5-5", {
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 0,
      }),
      4 + 2 + 0.2,
    );
  });

  it("gives no estimate rather than a wrong one for an unknown model", () => {
    assert.equal(estimateCostUsd("some-other-model", FAKE_USAGE), null);
  });
});

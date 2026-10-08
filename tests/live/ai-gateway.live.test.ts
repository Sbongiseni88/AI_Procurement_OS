import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import { type AiRunLogEntry, runAiTask } from "../../src/lib/ai/gateway.ts";
import { createAnthropicProvider } from "../../src/lib/ai/providers/anthropic.ts";

/**
 * The one live run of E1.5.6 (opt-in, costs real money: a few hundred tokens of
 * Claude Opus 5.5, well under US$0.05). Run with `npm run test:ai-live` once the
 * client's ANTHROPIC_API_KEY is in .env.local; without a key it is skipped. It sends
 * no documents and no client data, and logs to memory, not the database.
 */
const key = process.env.ANTHROPIC_API_KEY;

describe("AI gateway, live", { skip: key ? false : "ANTHROPIC_API_KEY is not set" }, () => {
  it("runs the connectivity check on Claude Opus 5.5 and logs it", async () => {
    const entries: AiRunLogEntry[] = [];
    const result = await runAiTask(
      {
        providers: { anthropic: createAnthropicProvider(key ?? "") },
        log: { record: async (entry) => void entries.push(entry) },
      },
      {
        task: "connectivity_check",
        organizationId: "00000000-0000-4000-8000-000000000000",
        instructions: "You are a connectivity check. Answer exactly as asked.",
        prompt: 'Set "status" to "ready".',
        output: z.object({ status: z.literal("ready") }),
      },
    );

    assert.deepEqual(result.output, { status: "ready" });
    assert.equal(entries[0]?.outcome, "succeeded");
    assert.ok((entries[0]?.usage?.inputTokens ?? 0) > 0);
    console.log(
      `served by ${result.run.servedModel}; ${result.run.usage.inputTokens} in / ${result.run.usage.outputTokens} out; ` +
        `~US$${result.run.estimatedCostUsd ?? "?"}; ${result.run.latencyMs} ms`,
    );
  });
});

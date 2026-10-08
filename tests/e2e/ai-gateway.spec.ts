import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { runAiTask } from "@/lib/ai/gateway";
import { createAiRunLog } from "@/lib/ai/log";
import { createFakeProvider } from "@/lib/ai/providers/fake";
import { type Database } from "@/lib/supabase/database.types";

import { deleteOrganization } from "./support/users";

/**
 * The AI gateway's run log (E1.5.6) against the real database, with the fake provider:
 * no model is called and nothing is spent. Every call is logged, whatever its outcome.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env.local.`);
  return value;
}

const db = createClient<Database>(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SECRET_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const Answer = z.object({ status: z.literal("ready") });

test.describe("AI gateway run log", () => {
  let organizationId = "";
  test.beforeEach(async () => {
    const { data, error } = await db
      .from("organizations")
      .insert({ name: `E2E AI ${randomUUID().slice(0, 8)}` })
      .select("id")
      .single();
    if (error) throw new Error(`organization insert failed: ${error.message}`);
    organizationId = data.id;
  });
  test.afterEach(async () => {
    // Runs go with their company (cascade); they cannot be deleted otherwise.
    if (organizationId) await deleteOrganization(organizationId);
  });

  test("logs a successful call with model, tokens, cost and time", async () => {
    const actorId = randomUUID();
    const result = await runAiTask(
      {
        providers: {
          anthropic: createFakeProvider({ status: "completed", output: { status: "ready" } }),
        },
        log: createAiRunLog(db),
      },
      {
        task: "connectivity_check",
        organizationId,
        actorId,
        instructions: "",
        prompt: "",
        output: Answer,
      },
    );
    expect(result.output).toEqual({ status: "ready" });

    const { data } = await db
      .from("ai_runs")
      .select(
        "task, provider, model, served_model, outcome, error, input_tokens, output_tokens, estimated_cost_usd, latency_ms, created_by, job_id",
      )
      .eq("organization_id", organizationId);
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      task: "connectivity_check",
      provider: "anthropic",
      model: "claude-opus-5-5",
      served_model: "claude-opus-5-5",
      outcome: "succeeded",
      error: null,
      input_tokens: 1000,
      output_tokens: 200,
      estimated_cost_usd: 0.008,
      created_by: actorId,
      job_id: null,
    });
    expect(data?.[0]?.latency_ms).toBeGreaterThanOrEqual(0);
  });

  test("logs a call refused because no API key is configured", async () => {
    await expect(
      runAiTask(
        { providers: {}, log: createAiRunLog(db) },
        {
          task: "read_company_document",
          organizationId,
          instructions: "",
          prompt: "",
          output: Answer,
        },
      ),
    ).rejects.toMatchObject({ code: "not_configured" });

    const { data } = await db
      .from("ai_runs")
      .select("task, outcome, error, input_tokens, estimated_cost_usd")
      .eq("organization_id", organizationId);
    expect(data).toEqual([
      {
        task: "read_company_document",
        outcome: "not_configured",
        error: "AI is not configured: set ANTHROPIC_API_KEY on the server to run AI tasks.",
        input_tokens: null,
        estimated_cost_usd: null,
      },
    ]);
  });
});

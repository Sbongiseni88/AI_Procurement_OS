import type { z } from "zod";

import {
  AI_TASKS,
  type AiProviderName,
  type AiRoute,
  type AiTaskName,
  estimateCostUsd,
} from "./config.ts";
import { AiError, type AiInputFile, type AiProvider, type AiUsage } from "./types.ts";

/**
 * The AI gateway's core (E1.5.6): route the task, call the provider with a timeout,
 * validate the answer with Zod, and log the call in `ai_runs`, whatever the outcome.
 * Pure: the providers and the log are passed in, so tests use the fake provider and
 * an in-memory log (`tests/unit/ai-gateway.test.ts`). The app calls `runAiTask` from
 * `./index.ts`, which wires the real ones.
 */

export type AiRunOutcome =
  | "succeeded"
  | "refused"
  | "truncated"
  | "invalid_output"
  | "timed_out"
  | "provider_error"
  | "not_configured";

/** One `ai_runs` row. No prompts, document contents or model output. */
export type AiRunLogEntry = {
  organizationId: string;
  jobId: string | null;
  createdBy: string | null;
  task: AiTaskName;
  provider: AiProviderName;
  model: string;
  servedModel: string | null;
  outcome: AiRunOutcome;
  error: string | null;
  usage: AiUsage | null;
  estimatedCostUsd: number | null;
  latencyMs: number;
};

export interface AiRunLog {
  record(entry: AiRunLogEntry): Promise<void>;
}

export type AiGatewayDeps = {
  /** Only providers with credentials are present; a missing one means "not configured". */
  providers: Readonly<Partial<Record<AiProviderName, AiProvider>>>;
  log: AiRunLog;
  routes?: Readonly<Record<AiTaskName, AiRoute>>;
  now?: () => number;
};

export type AiTaskRequest<S extends z.ZodType> = {
  task: AiTaskName;
  /** The company the work is for, from the session or the job; never from user input. */
  organizationId: string;
  jobId?: string | null;
  /** The person whose action caused the call, if any. */
  actorId?: string | null;
  instructions: string;
  prompt: string;
  files?: readonly AiInputFile[];
  output: S;
};

export type AiTaskResult<T> = {
  output: T;
  run: {
    model: string;
    servedModel: string;
    usage: AiUsage;
    estimatedCostUsd: number | null;
    latencyMs: number;
  };
};

const NOT_CONFIGURED_MESSAGE: Record<AiProviderName, string> = {
  anthropic: "AI is not configured: set ANTHROPIC_API_KEY on the server to run AI tasks.",
};

export async function runAiTask<S extends z.ZodType>(
  deps: AiGatewayDeps,
  request: AiTaskRequest<S>,
): Promise<AiTaskResult<z.output<S>>> {
  const route = (deps.routes ?? AI_TASKS)[request.task];
  const now = deps.now ?? (() => Date.now());
  const started = now();

  async function finish(
    outcome: AiRunOutcome,
    details: { servedModel?: string; usage?: AiUsage; error?: string },
  ): Promise<{ latencyMs: number; estimatedCostUsd: number | null }> {
    const latencyMs = Math.max(0, Math.round(now() - started));
    const usage = details.usage ?? null;
    const servedModel = details.servedModel ?? null;
    const estimatedCostUsd =
      usage === null ? null : estimateCostUsd(servedModel ?? route.model, usage);
    try {
      await deps.log.record({
        organizationId: request.organizationId,
        jobId: request.jobId ?? null,
        createdBy: request.actorId ?? null,
        task: request.task,
        provider: route.provider,
        model: route.model,
        servedModel,
        outcome,
        error: details.error ?? null,
        usage,
        estimatedCostUsd,
        latencyMs,
      });
    } catch (logError: unknown) {
      // The call happened (and may have cost money) either way. Failing the task now
      // would make its job retry and pay again, so the missing row is logged instead.
      console.error(
        `ai_runs row not written for ${request.task}: ${logError instanceof Error ? logError.message : "unknown error"}`,
      );
    }
    return { latencyMs, estimatedCostUsd };
  }

  async function fail(
    error: AiError,
    outcome: AiRunOutcome,
    details: { servedModel?: string; usage?: AiUsage } = {},
  ): Promise<never> {
    await finish(outcome, { ...details, error: error.message });
    throw error;
  }

  const provider = deps.providers[route.provider];
  if (provider === undefined) {
    return fail(
      new AiError("not_configured", NOT_CONFIGURED_MESSAGE[route.provider], false),
      "not_configured",
    );
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new AiError("timed_out", `The AI took longer than ${route.timeoutMs / 1000} s.`, true),
      );
    }, route.timeoutMs);
  });

  let response;
  try {
    response = await Promise.race([
      provider.generate({
        model: route.model,
        effort: route.effort,
        maxOutputTokens: route.maxOutputTokens,
        instructions: request.instructions,
        prompt: request.prompt,
        files: request.files ?? [],
        output: request.output,
        signal: controller.signal,
      }),
      timeout,
    ]);
  } catch (error: unknown) {
    const aiError =
      error instanceof AiError
        ? error
        : new AiError(
            "provider_error",
            error instanceof Error ? error.message : "The AI provider failed.",
            true,
          );
    return fail(aiError, aiError.code === "timed_out" ? "timed_out" : "provider_error");
  } finally {
    clearTimeout(timer);
  }

  const { servedModel, usage } = response;
  if (response.status === "refused") {
    const reason = response.reason === null ? "" : ` (${response.reason})`;
    return fail(
      new AiError("refused", `The AI declined this request${reason}.`, false),
      "refused",
      { servedModel, usage },
    );
  }
  if (response.status === "truncated") {
    return fail(
      new AiError("truncated", "The AI's answer was cut off at its output limit.", false),
      "truncated",
      { servedModel, usage },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch {
    return fail(
      new AiError("invalid_output", "The AI's answer was not valid JSON.", true),
      "invalid_output",
      { servedModel, usage },
    );
  }
  const parsed = request.output.safeParse(json);
  if (!parsed.success) {
    // Paths only, never values: the values come from the documents.
    const fields = parsed.error.issues
      .slice(0, 5)
      .map((issue) => issue.path.join(".") || "(root)")
      .join(", ");
    return fail(
      new AiError(
        "invalid_output",
        `The AI's answer did not match the schema at: ${fields}.`,
        true,
      ),
      "invalid_output",
      { servedModel, usage },
    );
  }

  const { latencyMs, estimatedCostUsd } = await finish("succeeded", { servedModel, usage });
  return {
    output: parsed.data,
    run: { model: route.model, servedModel, usage, estimatedCostUsd, latencyMs },
  };
}

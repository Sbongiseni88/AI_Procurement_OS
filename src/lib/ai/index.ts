import "server-only";

import { type z } from "zod";

import { serverEnv } from "@/lib/env/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { type AiProviderName } from "./config.ts";
import { type AiTaskRequest, type AiTaskResult, runAiTask as runWith } from "./gateway.ts";
import { createAiRunLog } from "./log.ts";
import { createAnthropicProvider } from "./providers/anthropic.ts";
import { type AiProvider } from "./types.ts";

export { AiError, type AiErrorCode, type AiInputFile } from "./types.ts";
export { type AiTaskName } from "./config.ts";

/** Anthropic API keys start `sk-ant-`; admin keys (`sk-ant-admin`) must never be used here. */
function isUsableAnthropicKey(key: string): boolean {
  return key.startsWith("sk-ant-") && !key.startsWith("sk-ant-admin");
}

/**
 * The providers that have credentials. Without `ANTHROPIC_API_KEY` (or with an
 * unusable one) there are none, and every task fails fast with a clear
 * `not_configured` error, logged like any other run. The app still builds and runs.
 */
function configuredProviders(): Partial<Record<AiProviderName, AiProvider>> {
  const key = serverEnv.ANTHROPIC_API_KEY;
  if (key === undefined || !isUsableAnthropicKey(key)) return {};
  return { anthropic: createAnthropicProvider(key) };
}

/**
 * The one way the app uses AI (Architecture rule 6): run a task through the gateway
 * with the configured providers, logging the call in `ai_runs`. See `./gateway.ts`.
 */
export function runAiTask<S extends z.ZodType>(
  request: AiTaskRequest<S>,
): Promise<AiTaskResult<z.output<S>>> {
  return runWith(
    { providers: configuredProviders(), log: createAiRunLog(createSupabaseAdminClient()) },
    request,
  );
}

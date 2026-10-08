import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import {
  AiError,
  type AiInputFile,
  type AiProvider,
  type AiProviderResponse,
  type AiUsage,
} from "../types.ts";

/**
 * The Anthropic adapter, and the only file allowed to import the Anthropic SDK (an
 * ESLint rule enforces that). It takes the key as an argument so that it never reads
 * the environment itself; `../index.ts` passes it in on the server.
 *
 * Request shape for Claude Opus 5.5 (checked against the claude-api skill, 2026-10-08):
 * - thinking cannot be disabled; depth is `output_config.effort`, set explicitly per
 *   task because this model's default is `medium`;
 * - the answer comes back as JSON through structured outputs (`output_config.format`),
 *   built from the task's Zod schema; the gateway validates it with Zod again;
 * - streamed (`finalMessage`) because documents make long requests;
 * - `fallbacks: "default"`: if a safety classifier declines the request, Anthropic
 *   re-runs it on its recommended fallback model; `servedModel` records which model
 *   answered, and the gateway logs both.
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function contentBlocks(files: readonly AiInputFile[], prompt: string) {
  const blocks: Anthropic.Beta.Messages.BetaContentBlockParam[] = files.map((file) => {
    const data = Buffer.from(file.data).toString("base64");
    return file.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: file.mediaType, data } };
  });
  blocks.push({ type: "text", text: prompt });
  return blocks;
}

function usageOf(usage: Anthropic.Beta.Messages.BetaUsage): AiUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

/** SDK errors as gateway errors: retry what can succeed later, not what cannot. */
function toAiError(error: unknown): AiError {
  if (error instanceof Anthropic.APIUserAbortError) {
    return new AiError("timed_out", "The AI request was stopped at its time limit.", true);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError("timed_out", "The AI provider did not answer in time.", true);
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AiError("not_configured", "The Anthropic API key was refused.", false);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError("provider_error", "The AI provider is rate-limiting requests.", true);
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    return new AiError(
      "provider_error",
      `The AI provider rejected the request: ${error.message}`,
      false,
    );
  }
  if (error instanceof Anthropic.APIError) {
    return new AiError(
      "provider_error",
      `The AI provider failed (${error.status ?? "no status"}).`,
      true,
    );
  }
  return new AiError("provider_error", "The AI provider could not be reached.", true);
}

export function createAnthropicProvider(
  apiKey: string,
  /** Tests pass a fake `fetch` to check the request and response offline. */
  options: { fetch?: typeof globalThis.fetch } = {},
): AiProvider {
  // The gateway owns the timeout; the SDK's own retries cover brief 429/5xx blips.
  const client = new Anthropic({ apiKey, maxRetries: 2, ...options });

  return {
    name: "anthropic",
    async generate(request): Promise<AiProviderResponse> {
      let schema: Record<string, unknown>;
      try {
        schema = betaZodOutputFormat(request.output).schema;
      } catch {
        // A schema the provider cannot express is a code problem; retrying cannot fix it.
        throw new AiError(
          "provider_error",
          "The task's output schema cannot be expressed as a structured-output schema.",
          false,
        );
      }
      let message: Anthropic.Beta.Messages.BetaMessage;
      try {
        message = await client.beta.messages
          .stream(
            {
              model: request.model,
              max_tokens: request.maxOutputTokens,
              system: request.instructions,
              messages: [{ role: "user", content: contentBlocks(request.files, request.prompt) }],
              output_config: {
                effort: request.effort,
                format: { type: "json_schema", schema },
              },
              betas: [FALLBACK_BETA],
              fallbacks: "default",
            },
            { signal: request.signal },
          )
          .finalMessage();
      } catch (error: unknown) {
        throw toAiError(error);
      }

      const base = { servedModel: message.model, usage: usageOf(message.usage) };
      if (message.stop_reason === "refusal") {
        return { ...base, status: "refused", reason: message.stop_details?.category ?? null };
      }
      if (
        message.stop_reason === "max_tokens" ||
        message.stop_reason === "model_context_window_exceeded"
      ) {
        return { ...base, status: "truncated" };
      }
      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      return { ...base, status: "completed", text };
    },
  };
}

import type { z } from "zod";

/**
 * The provider-neutral contract of the AI gateway (E1.5.6, Architecture rule 6).
 * Modules ask for a task with instructions, files and a Zod output schema; a provider
 * adapter turns that into its own API call. Adding a provider is a new adapter that
 * implements `AiProvider`, not a change to any caller.
 */

export const AI_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];

/** A document or image the model reads. PDFs and images are read natively, no OCR. */
export type AiInputFile =
  | { kind: "pdf"; data: Uint8Array }
  | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; data: Uint8Array };

export type AiProviderRequest = {
  model: string;
  effort: AiEffort;
  maxOutputTokens: number;
  /** Standing instructions (system prompt). */
  instructions: string;
  /** The request itself, read after the files. */
  prompt: string;
  files: readonly AiInputFile[];
  /** The answer's shape; the adapter turns it into its provider's structured-output format. */
  output: z.ZodType;
  /** Aborted when the gateway's timeout for the task runs out. */
  signal: AbortSignal;
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** What a provider returns. The gateway, not the provider, validates `text` against the schema. */
export type AiProviderResponse =
  | { status: "completed"; servedModel: string; usage: AiUsage; text: string }
  | { status: "refused"; servedModel: string; usage: AiUsage; reason: string | null }
  | { status: "truncated"; servedModel: string; usage: AiUsage };

export interface AiProvider {
  readonly name: string;
  generate(request: AiProviderRequest): Promise<AiProviderResponse>;
}

export type AiErrorCode =
  "not_configured" | "timed_out" | "provider_error" | "refused" | "truncated" | "invalid_output";

/**
 * Every gateway failure. `code` says what happened; `retryable` says whether running
 * the same task again could succeed (a job handler turns `false` into a permanent
 * job failure). Messages are plain and never contain document contents.
 */
export class AiError extends Error {
  // Plain fields, not constructor parameter properties: the unit tests run this file
  // through Node's type stripping, which does not support those.
  readonly code: AiErrorCode;
  readonly retryable: boolean;

  constructor(code: AiErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.retryable = retryable;
  }
}

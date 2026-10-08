import type { AiEffort, AiUsage } from "./types.ts";

/**
 * Task-to-model routing: the one place that says which provider and model run each AI
 * task, how hard the model thinks (`effort`), and the output and time limits
 * (ARCHITECTURE.md §5). Changing a model or provider for a task is a change here.
 *
 * Timeouts stay under the job runner's budget (200 s per drain, Vercel Hobby's 300 s
 * function limit): a job handler's own timeout must be longer than its task's.
 */
export type AiProviderName = "anthropic";

export type AiRoute = {
  provider: AiProviderName;
  model: string;
  effort: AiEffort;
  maxOutputTokens: number;
  timeoutMs: number;
};

export const AI_TASKS = {
  /** A tiny request proving the key, model and logging work (the opt-in live test). */
  connectivity_check: {
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "low",
    maxOutputTokens: 2_000,
    timeoutMs: 60_000,
  },
  /** E2.3: type, issuer, dates and certification stamps of a company document. */
  read_company_document: {
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "high",
    maxOutputTokens: 16_000,
    timeoutMs: 170_000,
  },
  /** E3.3: key facts, returnables and stated rules of a tender, with pages and quotes. */
  read_tender: {
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "high",
    maxOutputTokens: 32_000,
    timeoutMs: 170_000,
  },
  /** E3.4: a document category for a requirement the lookup table cannot map. */
  suggest_requirement_category: {
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "low",
    maxOutputTokens: 2_000,
    timeoutMs: 60_000,
  },
} as const satisfies Record<string, AiRoute>;

export type AiTaskName = keyof typeof AI_TASKS;

/**
 * US dollars per million tokens, from Anthropic's published prices (checked
 * 2026-10-08). Cache writes are the 5-minute rate (1.25x input). The fallback models
 * are listed because a refusal fallback can answer on them. A model missing here
 * gets no cost estimate rather than a wrong one.
 */
const PRICES_USD_PER_MTOK: Readonly<
  Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }>
> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

/** An estimate for the log, not an invoice: provider billing is the source of truth. */
export function estimateCostUsd(model: string, usage: AiUsage): number | null {
  const price = PRICES_USD_PER_MTOK[model];
  if (price === undefined) return null;
  const usd =
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

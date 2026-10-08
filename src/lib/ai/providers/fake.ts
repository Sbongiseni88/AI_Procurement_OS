import type { AiProvider, AiProviderRequest, AiProviderResponse, AiUsage } from "../types.ts";

/**
 * A stand-in provider for every test (unit, E2E, verify): it never calls a real model
 * and never costs money. Give it a function that answers each request, or a fixed
 * answer; anything it throws reaches the gateway like a provider failure.
 */
export type FakeReply =
  | { status: "completed"; output: unknown }
  | { status: "refused"; reason?: string }
  | { status: "truncated" }
  /** Never answers; ends only when the gateway's timeout aborts the request. */
  | { status: "hang" };

export const FAKE_USAGE: AiUsage = {
  inputTokens: 1_000,
  outputTokens: 200,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export function createFakeProvider(
  reply: FakeReply | ((request: AiProviderRequest) => FakeReply | Promise<FakeReply>),
): AiProvider & { requests: AiProviderRequest[] } {
  const requests: AiProviderRequest[] = [];
  return {
    name: "fake",
    requests,
    async generate(request): Promise<AiProviderResponse> {
      requests.push(request);
      const answer = typeof reply === "function" ? await reply(request) : reply;
      const base = { servedModel: request.model, usage: FAKE_USAGE };
      switch (answer.status) {
        case "completed":
          return { ...base, status: "completed", text: JSON.stringify(answer.output) };
        case "refused":
          return { ...base, status: "refused", reason: answer.reason ?? null };
        case "truncated":
          return { ...base, status: "truncated" };
        case "hang":
          return new Promise<never>((_, reject) => {
            request.signal.addEventListener("abort", () => reject(new Error("aborted")));
          });
      }
    },
  };
}

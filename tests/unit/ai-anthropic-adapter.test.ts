import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import { createAnthropicProvider } from "../../src/lib/ai/providers/anthropic.ts";
import { AiError, type AiProviderRequest } from "../../src/lib/ai/types.ts";

/**
 * The Anthropic adapter, offline: a fake `fetch` records the request the SDK sends and
 * answers with a streamed (server-sent events) response, so the request shape and the
 * response mapping are checked without a key, network or cost.
 */

type Captured = { url: string; headers: Headers; body: Record<string, unknown> };

function sse(events: Record<string, unknown>[]): string {
  return events
    .map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
}

function streamedMessage(options: {
  text?: string;
  stopReason: string;
  model?: string;
  stopDetails?: Record<string, unknown>;
}): string {
  const events: Record<string, unknown>[] = [
    {
      type: "message_start",
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: options.model ?? "claude-opus-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 1200,
          output_tokens: 1,
          cache_read_input_tokens: 300,
          cache_creation_input_tokens: 0,
        },
      },
    },
  ];
  if (options.text !== undefined) {
    events.push(
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: options.text } },
      { type: "content_block_stop", index: 0 },
    );
  }
  events.push(
    {
      type: "message_delta",
      delta: {
        stop_reason: options.stopReason,
        stop_sequence: null,
        ...(options.stopDetails ? { stop_details: options.stopDetails } : {}),
      },
      usage: { output_tokens: 80 },
    },
    { type: "message_stop" },
  );
  return sse(events);
}

function fakeFetch(response: () => Response) {
  const calls: Captured[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const body: unknown = JSON.parse(String(init?.body ?? "{}"));
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body:
        typeof body === "object" && body !== null ? Object.fromEntries(Object.entries(body)) : {},
    });
    return response();
  };
  return { fetch, calls };
}

const eventStream = (payload: string) =>
  new Response(payload, { status: 200, headers: { "content-type": "text/event-stream" } });

function request(overrides: Partial<AiProviderRequest> = {}): AiProviderRequest {
  return {
    model: "claude-opus-5-5",
    effort: "high",
    maxOutputTokens: 16_000,
    instructions: "You read South African company documents.",
    prompt: "Read the certification stamp.",
    files: [{ kind: "pdf", data: new TextEncoder().encode("%PDF-1.4 synthetic") }],
    output: z.object({ office: z.string().min(1), date: z.iso.date().nullable() }),
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("Anthropic adapter", () => {
  it("sends the model, effort, schema, document and refusal fallback the gateway asked for", async () => {
    const { fetch, calls } = fakeFetch(() =>
      eventStream(
        streamedMessage({ text: '{"office":"SAPS","date":null}', stopReason: "end_turn" }),
      ),
    );
    await createAnthropicProvider("sk-ant-test", { fetch }).generate(request());

    const [call] = calls;
    assert.ok(call);
    assert.match(call.url, /\/v1\/messages/);
    assert.match(call.headers.get("anthropic-beta") ?? "", /server-side-fallback-2026-07-01/);
    assert.equal(call.headers.get("x-api-key"), "sk-ant-test");
    const body = call.body;
    assert.equal(body.model, "claude-opus-5-5");
    assert.equal(body.max_tokens, 16_000);
    assert.equal(body.stream, true);
    assert.equal(body.fallbacks, "default");
    assert.equal(body.system, "You read South African company documents.");
    assert.equal(body.thinking, undefined, "thinking cannot be disabled on this model; never sent");

    const outputConfig = z
      .object({
        effort: z.string(),
        format: z.object({
          type: z.literal("json_schema"),
          schema: z.record(z.string(), z.unknown()),
        }),
      })
      .parse(body.output_config);
    assert.equal(outputConfig.effort, "high");
    assert.equal(outputConfig.format.schema.additionalProperties, false);

    const content = z
      .array(z.object({ type: z.string() }).loose())
      .parse(z.array(z.object({ content: z.unknown() }).loose()).parse(body.messages)[0]?.content);
    assert.deepEqual(
      content.map((block) => block.type),
      ["document", "text"],
    );
    assert.deepEqual(content[0]?.source, {
      type: "base64",
      media_type: "application/pdf",
      data: Buffer.from("%PDF-1.4 synthetic").toString("base64"),
    });
  });

  it("returns the answer text, the model that served it and the token usage", async () => {
    const { fetch } = fakeFetch(() =>
      eventStream(
        streamedMessage({
          text: '{"office":"SAPS","date":"2026-01-21"}',
          stopReason: "end_turn",
          model: "claude-opus-4-8",
        }),
      ),
    );
    const response = await createAnthropicProvider("sk-ant-test", { fetch }).generate(request());
    assert.deepEqual(response, {
      status: "completed",
      servedModel: "claude-opus-4-8",
      usage: { inputTokens: 1200, outputTokens: 80, cacheReadTokens: 300, cacheWriteTokens: 0 },
      text: '{"office":"SAPS","date":"2026-01-21"}',
    });
  });

  it("reports a refusal with its category, and an answer cut off at max_tokens", async () => {
    const refused = fakeFetch(() =>
      eventStream(
        streamedMessage({
          stopReason: "refusal",
          stopDetails: { type: "refusal", category: "cyber", explanation: null },
        }),
      ),
    );
    const refusal = await createAnthropicProvider("sk-ant-test", refused).generate(request());
    assert.equal(refusal.status, "refused");

    const cut = fakeFetch(() =>
      eventStream(streamedMessage({ text: '{"office":"SA', stopReason: "max_tokens" })),
    );
    const truncated = await createAnthropicProvider("sk-ant-test", cut).generate(request());
    assert.equal(truncated.status, "truncated");
  });

  it("turns API errors into gateway errors with the right retry advice", async () => {
    const error = (status: number, type: string) => () =>
      new Response(JSON.stringify({ type: "error", error: { type, message: "test" } }), {
        status,
        headers: { "content-type": "application/json" },
      });

    const unauthorised = fakeFetch(error(401, "authentication_error"));
    await assert.rejects(
      createAnthropicProvider("sk-ant-wrong", unauthorised).generate(request()),
      (e: unknown) => e instanceof AiError && e.code === "not_configured" && !e.retryable,
    );

    const badRequest = fakeFetch(error(400, "invalid_request_error"));
    await assert.rejects(
      createAnthropicProvider("sk-ant-test", badRequest).generate(request()),
      (e: unknown) => e instanceof AiError && e.code === "provider_error" && !e.retryable,
    );
    assert.equal(badRequest.calls.length, 1, "a 400 is not retried");
  });

  it("refuses, without retrying, an output schema the provider cannot express", async () => {
    const { fetch, calls } = fakeFetch(() =>
      eventStream(streamedMessage({ text: "{}", stopReason: "end_turn" })),
    );
    // A Date has no JSON Schema form, so the schema cannot be converted at all.
    const Unrepresentable = z.object({ signedOn: z.date() });
    await assert.rejects(
      createAnthropicProvider("sk-ant-test", { fetch }).generate(
        request({ output: Unrepresentable }),
      ),
      (e: unknown) => e instanceof AiError && e.code === "provider_error" && !e.retryable,
    );
    assert.equal(calls.length, 0, "nothing was sent");
  });

  it("stops when the gateway aborts the request", async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetch } = fakeFetch(() =>
      eventStream(streamedMessage({ text: "{}", stopReason: "end_turn" })),
    );
    await assert.rejects(
      createAnthropicProvider("sk-ant-test", { fetch }).generate(
        request({ signal: controller.signal }),
      ),
      (e: unknown) => e instanceof AiError && e.code === "timed_out",
    );
  });
});

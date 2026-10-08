import { z } from "zod";

import { defineJobHandler, type JobHandlers, PermanentJobError } from "./runner";

/**
 * Every job type the runner knows, with its handler (Architecture rule 7). Adding a
 * kind of background work, or a future AI agent, is a new entry here: a name, a Zod
 * payload schema, a timeout and a function. E2.3 adds `document.read`, E3.3
 * `tender.read`.
 */

/**
 * `ping`: proves the job system end to end (enqueue → claim → run → result). It
 * fails when asked to, so the retry and failure paths can be exercised too.
 */
const ping = defineJobHandler({
  payload: z.object({
    fail: z.enum(["retryable", "permanent"]).optional(),
  }),
  timeoutMs: 10_000,
  async run(payload) {
    if (payload.fail === "permanent") throw new PermanentJobError("Ping was asked to fail.");
    if (payload.fail === "retryable") throw new Error("Ping was asked to fail; it will retry.");
    return { pong: true };
  },
});

export const JOB_HANDLERS = { ping } satisfies JobHandlers;

export type JobType = keyof typeof JOB_HANDLERS;

export function isJobType(value: string): value is JobType {
  return Object.hasOwn(JOB_HANDLERS, value);
}

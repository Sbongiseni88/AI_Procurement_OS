import { timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env/server";
import { runJobsNow } from "@/lib/jobs/run";

/**
 * The job runner (E1.5.5): runs due jobs across every company. Called by Vercel Cron
 * once a day (`vercel.json`, the Hobby plan's limit) as a safety net; jobs normally
 * run right after they are queued (`recordDomainEvent` → `after`). Anyone else with
 * the secret may kick it too.
 *
 * Requires `Authorization: Bearer <CRON_SECRET>`. Without a configured secret the
 * route refuses every request, so the app can be deployed before the secret exists.
 */
export const maxDuration = 300;

const MIN_SECRET_LENGTH = 16;

function bearerMatches(header: string | null, secret: string): boolean {
  if (header === null || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request): Promise<Response> {
  const secret = serverEnv.CRON_SECRET;
  if (secret === undefined || secret.length < MIN_SECRET_LENGTH) {
    return Response.json({ error: "The job runner is not configured." }, { status: 503 });
  }
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const summary = await runJobsNow();
  if (summary === null) {
    return Response.json({ error: "The job runner stopped; see the server log." }, { status: 500 });
  }
  return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
}

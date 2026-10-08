import "server-only";

import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type Json } from "@/lib/supabase/database.types";
import { requireMembership } from "@/lib/workspace/membership";

/**
 * Every audited action, named `<entity>.<past-tense verb>`, with the entity type it
 * acts on. Add new ones as tickets introduce them (uploads E2.2, confirmations
 * E2.6, overrides E4.3).
 */
const AUDIT_ACTION_NAMES = ["workspace.created"] as const;

export type AuditAction = (typeof AUDIT_ACTION_NAMES)[number];

const ENTITY_TYPE: Record<AuditAction, string> = {
  "workspace.created": "organization",
};

const AuditEventInput = z.object({
  action: z.enum(AUDIT_ACTION_NAMES),
  entityId: z.uuid().nullable(),
  details: z.record(z.string(), z.json()),
});

/**
 * The one way to write to `audit_events` (E1.5).
 *
 * Users have no INSERT privilege on the table, so they cannot forge entries through
 * the API; this helper writes with the service role instead. That is safe only
 * because nothing here comes from the caller's input except the action, the
 * entity id and the details: the organization is read from the signed-in user's
 * own membership (through RLS) and the actor is the verified JWT subject.
 *
 * Details must never contain ID numbers, bank details or document contents
 * (CLAUDE.md §1.5): record what happened, not the data itself.
 *
 * Throws if the event cannot be written, so a call site never silently loses one.
 */
export async function recordAuditEvent(input: {
  action: AuditAction;
  entityId: string | null;
  details?: Record<string, Json>;
}): Promise<void> {
  const event = AuditEventInput.parse({ details: {}, ...input });
  const membership = await requireMembership();

  const { error } = await createSupabaseAdminClient().from("audit_events").insert({
    organization_id: membership.organization.id,
    actor_id: membership.userId,
    action: event.action,
    entity_type: ENTITY_TYPE[event.action],
    entity_id: event.entityId,
    details: event.details,
  });
  if (error) throw new Error(`Audit event ${event.action} was not recorded: ${error.message}`);
}

import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { type Action, type AppRole, can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { type Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
/** Compile-time check: the matrix's roles are exactly the database's `app_role` values. */
export type RolesMatchDatabase = Assert<Same<AppRole, Database["public"]["Enums"]["app_role"]>>;

/** The signed-in person in their company workspace. */
export type Membership = {
  userId: string;
  email: string;
  fullName: string;
  role: AppRole;
  organization: { id: string; name: string };
};

/**
 * The signed-in user's active membership: the company they are working in and their
 * role there, or null if they have none (not onboarded yet, or every membership
 * removed). Read through the user's own client, so RLS decides what comes back.
 *
 * A person may hold several active memberships, but RLS shows them only one
 * organization: the one `private.current_organization_id()` picks (their selected
 * company if they are an active member of it, else their oldest active membership).
 * The inner join therefore keeps exactly that membership. Nothing here trusts the
 * selection stored on the profile.
 */
export const getMembership = cache(async (): Promise<Membership | null> => {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, organization:organizations!inner (id, name), profile:profiles!inner (full_name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`Could not load your workspace: ${error.message}`);
  if (data === null) return null;
  return {
    userId: user.id,
    email: user.email,
    fullName: data.profile.full_name ?? "",
    role: data.role,
    organization: data.organization,
  };
});

/**
 * Whether the signed-in person has a profile. Everyone gets one with their first
 * company (onboarding), so a profile without an active membership means they used to
 * belong to a company: removed from it, or the company was deleted. Onboarding is for
 * first-time users only and refuses them.
 */
export async function hasProfile(): Promise<boolean> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").select("id").eq("id", user.id);
  if (error) throw new Error(`Could not load your account: ${error.message}`);
  return data.length > 0;
}

/** For every page inside the workspace: sends people without one to onboarding. */
export async function requireMembership(): Promise<Membership> {
  const membership = await getMembership();
  if (membership === null) redirect("/onboarding");
  return membership;
}

/** Thrown when the signed-in person's role does not allow an action. */
export class PermissionDeniedError extends Error {
  constructor(readonly action: Action) {
    super(`Your role does not allow this action (${action}).`);
    this.name = "PermissionDeniedError";
  }
}

/**
 * For every server action and server helper that writes: the active membership, if
 * its role may perform `action` (permission matrix, `src/lib/auth/permissions.ts`).
 * Throws PermissionDeniedError otherwise; callers turn it into a plain-language message.
 */
export async function requirePermission(action: Action): Promise<Membership> {
  const membership = await requireMembership();
  if (!can(membership.role, action)) throw new PermissionDeniedError(action);
  return membership;
}

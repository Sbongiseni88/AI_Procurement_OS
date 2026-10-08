import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type Database } from "@/lib/supabase/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ROLE_LABELS: Record<AppRole, string> = {
  bid_manager: "Bid manager",
  pricing_specialist: "Pricing specialist",
  executive_approver: "Executive approver",
};

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

/** For every page inside the workspace: sends people without one to onboarding. */
export async function requireMembership(): Promise<Membership> {
  const membership = await getMembership();
  if (membership === null) redirect("/onboarding");
  return membership;
}

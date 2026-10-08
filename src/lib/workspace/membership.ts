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
 * The signed-in user's profile and organization, or null if they have not completed
 * onboarding. Read through the user's own client, so RLS decides what comes back.
 */
export const getMembership = cache(async (): Promise<Membership | null> => {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    // Named: profiles has two foreign keys to organizations since E1.5.2.
    .select("role, full_name, organization:organizations!profiles_organization_id_fkey (id, name)")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load your workspace: ${error.message}`);
  if (data === null || data.organization === null) return null;
  return {
    userId: user.id,
    email: user.email,
    fullName: data.full_name ?? "",
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

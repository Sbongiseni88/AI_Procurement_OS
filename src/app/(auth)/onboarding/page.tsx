import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthHeading } from "@/components/auth/auth-heading";
import { OnboardingForm } from "@/components/workspace/onboarding-form";
import { logOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { getMembership, hasProfile } from "@/lib/workspace/membership";

export const metadata: Metadata = { title: "Set up your workspace" };

/**
 * First stop after sign-up: create the company workspace this account belongs to.
 * Someone who belonged to a company before (profile, but no active membership) cannot
 * start over here; they need a company's executive approver to restore their access.
 */
export default async function OnboardingPage() {
  const user = await requireUser();
  if ((await getMembership()) !== null) redirect("/");
  const returning = await hasProfile();

  return (
    <>
      {returning ? (
        <AuthHeading
          title="No active company"
          description="Your account is no longer an active member of a company. Ask your company’s executive approver to restore your access, then log in again."
        />
      ) : (
        <>
          <AuthHeading
            title="Set up your workspace"
            description="Your tenders and company documents will live here. You’ll be its executive approver."
          />
          <OnboardingForm />
        </>
      )}
      {/* Guest pages redirect signed-in people here, so this is the only way out. */}
      <form action={logOut} className="text-sm break-words text-ink-muted">
        Not {user.email}?{" "}
        <button
          type="submit"
          className="text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Log out
        </button>
      </form>
    </>
  );
}

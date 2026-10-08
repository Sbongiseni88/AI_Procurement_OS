import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthHeading } from "@/components/auth/auth-heading";
import { OnboardingForm } from "@/components/workspace/onboarding-form";
import { logOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { getMembership } from "@/lib/workspace/membership";

export const metadata: Metadata = { title: "Set up your workspace" };

/** First stop after sign-up: create the company workspace this account belongs to. */
export default async function OnboardingPage() {
  const user = await requireUser();
  if ((await getMembership()) !== null) redirect("/");

  return (
    <>
      <AuthHeading
        title="Set up your workspace"
        description="Your tenders and company documents will live here. You’ll be its executive approver."
      />
      <OnboardingForm />
      {/* Guest pages redirect signed-in people here, so this is the only way out. */}
      <form action={logOut} className="text-ink-muted text-sm">
        Not {user.email}?{" "}
        <button
          type="submit"
          className="text-accent focus-visible:outline-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Log out
        </button>
      </form>
    </>
  );
}

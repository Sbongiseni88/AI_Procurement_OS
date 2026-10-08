import { type Metadata } from "next";
import Link from "next/link";

import { AuthHeading } from "@/components/auth/auth-heading";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { isFreshEmailLinkSession, requireUser, RESET_WINDOW_MINUTES } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reached from a password-reset email, whose link signs the person in first. */
export default async function ResetPasswordPage() {
  const user = await requireUser();

  if (!(await isFreshEmailLinkSession())) {
    return (
      <>
        <AuthHeading
          title="Use the link in your reset email"
          description={`A new password can only be set within ${RESET_WINDOW_MINUTES} minutes of opening a password-reset link.`}
        />
        <p className="text-ink-muted text-sm">
          Log out, choose “Forgot your password?” and open the new link on this device.
        </p>
        <Link href="/" className="text-accent text-sm underline-offset-4 hover:underline">
          Back to the app
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Choose a new password" description={`For ${user.email}.`} />
      <NewPasswordForm />
    </>
  );
}

import { type Metadata } from "next";

import { AuthHeading } from "@/components/auth/auth-heading";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading
        title="Reset your password"
        description="We’ll email you a link to choose a new one."
      />
      <ForgotPasswordForm />
    </>
  );
}

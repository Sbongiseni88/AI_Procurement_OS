import { type Metadata } from "next";

import { AuthHeading } from "@/components/auth/auth-heading";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <>
      <AuthHeading
        title="Create an account"
        description="You’ll set up your company workspace next."
      />
      <SignUpForm />
    </>
  );
}

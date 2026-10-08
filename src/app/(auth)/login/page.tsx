import { type Metadata } from "next";

import { AuthHeading } from "@/components/auth/auth-heading";
import { LogInForm } from "@/components/auth/log-in-form";
import { safeNextPath } from "@/lib/auth/paths";

export const metadata: Metadata = { title: "Log in" };

const NOTICES: Record<string, string> = {
  link: "That link has expired or was opened in a different browser. Log in, or request a new link.",
};

export default async function LogInPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next) : "/";
  const notice = typeof params.error === "string" ? NOTICES[params.error] : undefined;

  return (
    <>
      <AuthHeading title="Log in" description="Use the email and password for your account." />
      <LogInForm next={next === "/" ? undefined : next} notice={notice} />
    </>
  );
}

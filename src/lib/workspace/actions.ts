"use server";

import { redirect } from "next/navigation";

import { fieldErrorsOf } from "@/lib/auth/schemas";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type OnboardingFormState, OnboardingSchema } from "@/lib/workspace/schemas";

/**
 * Creates the company workspace and the caller's profile in one database call
 * (`complete_onboarding`, see the E1.4 migration). The function itself refuses a
 * second workspace, so this action does not need to check first.
 */
export async function completeOnboarding(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  await requireUser();
  const values = {
    companyName: String(formData.get("companyName") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
  };
  const parsed = OnboardingSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
      values,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("complete_onboarding", {
    company_name: parsed.data.companyName,
    full_name: parsed.data.fullName,
  });

  // 23505: this account already has a workspace (e.g. a double submit). Go to it.
  if (error && error.code !== "23505") {
    return {
      status: "error",
      message: "Your workspace could not be created. Please try again.",
      values,
    };
  }

  redirect("/");
}

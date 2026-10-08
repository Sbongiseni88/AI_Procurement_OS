"use server";

import { redirect, unstable_rethrow } from "next/navigation";

import { recordAuditEvent } from "@/lib/audit/record";
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
  const { data: organizationId, error } = await supabase.rpc("complete_onboarding", {
    company_name: parsed.data.companyName,
    full_name: parsed.data.fullName,
  });

  // 23505: this account already has a workspace (e.g. a double submit). Go to it;
  // its creation was logged by the first submit.
  if (error?.code === "23505") redirect("/");
  if (error) {
    return {
      status: "error",
      message: "Your workspace could not be created. Please try again.",
      values,
    };
  }

  try {
    await recordAuditEvent({
      action: "workspace.created",
      entityId: organizationId,
      details: { organizationName: parsed.data.companyName, role: "executive_approver" },
    });
  } catch (auditError: unknown) {
    // Let Next's own control flow (redirect, notFound) through untouched.
    unstable_rethrow(auditError);
    // The workspace exists either way, and failing here would strand the person on a
    // page that now redirects them away. Record the miss in the server log instead.
    // Trade-off (ARCHITECTURE.md §8): workspace and event are two writes, not one
    // transaction, so a database failure between them loses this one event.
    console.error(auditError instanceof Error ? auditError.message : "audit write failed");
  }

  redirect("/");
}

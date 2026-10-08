"use client";

import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFocusFirstError } from "@/components/forms/use-focus-first-error";
import { completeOnboarding } from "@/lib/workspace/actions";
import { type OnboardingFormState } from "@/lib/workspace/schemas";

const IDLE: OnboardingFormState = { status: "idle" };

export function OnboardingForm() {
  const [state, action] = useActionState(completeOnboarding, IDLE);
  const formRef = useFocusFirstError(state);
  const error = state.status === "error" ? state : undefined;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      {error && <FormMessage tone="error">{error.message}</FormMessage>}
      <Field
        name="companyName"
        label="Company name"
        autoComplete="organization"
        required
        maxLength={200}
        hint="As registered with CIPC. You can change it later."
        defaultValue={error?.values.companyName}
        error={error?.fieldErrors?.companyName}
      />
      <Field
        name="fullName"
        label="Your name"
        autoComplete="name"
        required
        maxLength={200}
        defaultValue={error?.values.fullName}
        error={error?.fieldErrors?.fullName}
      />
      <SubmitButton label="Create workspace" pendingLabel="Creating workspace…" />
    </form>
  );
}

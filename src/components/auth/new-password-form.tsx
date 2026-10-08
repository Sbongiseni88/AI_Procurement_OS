"use client";

import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFocusFirstError } from "@/components/forms/use-focus-first-error";
import { updatePassword } from "@/lib/auth/actions";
import { IDLE, MIN_PASSWORD_LENGTH } from "@/lib/auth/schemas";

export function NewPasswordForm() {
  const [state, action] = useActionState(updatePassword, IDLE);
  const formRef = useFocusFirstError(state);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormMessage tone="error">{state.message}</FormMessage>}
      <Field
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        error={fieldErrors?.password}
      />
      <Field
        name="confirmPassword"
        label="Repeat new password"
        type="password"
        autoComplete="new-password"
        required
        error={fieldErrors?.confirmPassword}
      />
      <SubmitButton label="Save new password" pendingLabel="Saving…" />
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFocusFirstError } from "@/components/forms/use-focus-first-error";
import { requestPasswordReset } from "@/lib/auth/actions";
import { IDLE } from "@/lib/auth/schemas";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, IDLE);
  const formRef = useFocusFirstError(state);

  if (state.status === "sent") {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage tone="info">{state.message}</FormMessage>
        <Link href="/login" className="text-sm text-accent underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormMessage tone="error">{state.message}</FormMessage>}
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        spellCheck={false}
        required
        defaultValue={state.status === "error" ? state.email : undefined}
        error={state.status === "error" ? state.fieldErrors?.email : undefined}
      />
      <SubmitButton label="Send reset link" pendingLabel="Sending…" />
      <Link href="/login" className="text-sm text-accent underline-offset-4 hover:underline">
        Back to log in
      </Link>
    </form>
  );
}

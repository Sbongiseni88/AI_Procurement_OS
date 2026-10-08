"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFocusFirstError } from "@/components/forms/use-focus-first-error";
import { signUp } from "@/lib/auth/actions";
import { IDLE, MIN_PASSWORD_LENGTH } from "@/lib/auth/schemas";

export function SignUpForm() {
  const [state, action] = useActionState(signUp, IDLE);
  const formRef = useFocusFirstError(state);

  if (state.status === "sent") {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage tone="info">{state.message}</FormMessage>
        <Link href="/login" className="text-accent text-sm underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormMessage tone="error">{state.message}</FormMessage>}
      <Field
        name="email"
        label="Work email"
        type="email"
        autoComplete="email"
        spellCheck={false}
        required
        defaultValue={state.status === "error" ? state.email : undefined}
        error={fieldErrors?.email}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        error={fieldErrors?.password}
      />
      <SubmitButton label="Create account" pendingLabel="Creating account…" />
      <p className="text-ink-muted text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-accent underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

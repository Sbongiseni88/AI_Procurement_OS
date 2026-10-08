"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFocusFirstError } from "@/components/forms/use-focus-first-error";
import { logIn } from "@/lib/auth/actions";
import { IDLE } from "@/lib/auth/schemas";

export function LogInForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState(logIn, IDLE);
  const formRef = useFocusFirstError(state);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const email = state.status === "idle" ? undefined : state.email;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" ? (
        <FormMessage tone="error">{state.message}</FormMessage>
      ) : (
        notice && <FormMessage tone="info">{notice}</FormMessage>
      )}
      {next && <input type="hidden" name="next" value={next} />}
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        spellCheck={false}
        required
        defaultValue={email}
        error={fieldErrors?.email}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldErrors?.password}
      />
      <SubmitButton label="Log in" pendingLabel="Logging in…" />
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/forgot-password" className="text-accent underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
        <Link href="/signup" className="text-accent underline-offset-4 hover:underline">
          Create an account
        </Link>
      </div>
    </form>
  );
}

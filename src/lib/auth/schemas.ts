import { z } from "zod";

/** Supabase's own minimum is 6; 8 is the floor we ask people for. */
export const MIN_PASSWORD_LENGTH = 8;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }));

const newPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` })
  .max(72, { error: "Use 72 characters or fewer." });

export const LogInSchema = z.object({
  email,
  password: z.string().min(1, { error: "Enter your password." }),
  next: z.string().optional(),
});

export const SignUpSchema = z.object({ email, password: newPassword });

export const PasswordResetRequestSchema = z.object({ email });

export const NewPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    error: "The passwords do not match.",
    path: ["confirmPassword"],
  });

/**
 * What every auth form action returns to its `useActionState` hook. `email` is echoed
 * back so the form keeps what the person typed after a failed attempt.
 */
export type AuthFormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<Record<string, string>>;
      email?: string;
    }
  | { status: "sent"; message: string; email: string };

export const IDLE: AuthFormState = { status: "idle" };

/** Flattens a Zod error to the first message per field, keyed by field name. */
export function fieldErrorsOf(error: z.ZodError): Partial<Record<string, string>> {
  const fieldErrors: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && fieldErrors[key] === undefined) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/auth/paths";
import {
  type AuthFormState,
  fieldErrorsOf,
  LogInSchema,
  NewPasswordSchema,
  PasswordResetRequestSchema,
  SignUpSchema,
} from "@/lib/auth/schemas";
import { isFreshEmailLinkSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Auth Server Actions. Each one parses its FormData with Zod before touching Supabase
 * and answers in plain language. Supabase's messages are not shown directly: they
 * are technical, and some would confirm whether an email address has an account.
 */

/**
 * The site's own origin, for links in auth emails. Next.js rejects a Server Action
 * whose Origin does not match the Host, and Supabase only sends links to URLs on the
 * project's redirect allow-list, so this cannot be pointed at another site.
 */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin !== null) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function callbackUrl(origin: string, next: string): string {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", next);
  return url.toString();
}

const TRY_AGAIN = "Something went wrong on our side. Please try again.";
const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";

export async function logIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = LogInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
      email: String(formData.get("email") ?? ""),
    };
  }
  const { email, password, next } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const message =
      error.code === "invalid_credentials"
        ? "That email and password don’t match an account."
        : error.code === "email_not_confirmed"
          ? "Confirm your email address first. Use the link in the email we sent you."
          : error.status === 429
            ? TOO_MANY
            : TRY_AGAIN;
    return { status: "error", message, email };
  }

  redirect(safeNextPath(next));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = SignUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
      email: String(formData.get("email") ?? ""),
    };
  }
  const { email, password } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl(await siteOrigin(), "/") },
  });
  if (error) {
    const message =
      error.code === "weak_password"
        ? "Choose a stronger password: longer, and not a common one."
        : error.code === "user_already_exists"
          ? "An account with this email already exists. Log in instead."
          : error.status === 429
            ? TOO_MANY
            : TRY_AGAIN;
    return { status: "error", message, email };
  }

  // With email confirmation off, Supabase signs the person in straight away.
  if (data.session !== null) redirect("/");

  // With confirmation on, an existing address gets the same answer as a new one, so
  // this form cannot be used to find out who has an account.
  return {
    status: "sent",
    message: `We sent a confirmation link to ${email}. Open it on this device to finish signing up.`,
    email,
  };
}

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = PasswordResetRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
      email: String(formData.get("email") ?? ""),
    };
  }
  const { email } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl(await siteOrigin(), "/reset-password"),
  });
  if (error?.status === 429) return { status: "error", message: TOO_MANY, email };
  if (error) return { status: "error", message: TRY_AGAIN, email };

  return {
    status: "sent",
    message: `If ${email} has an account, we sent it a link to choose a new password. Open it on this device.`,
    email,
  };
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = NewPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  // Same rule as the page: only a session opened from a reset link may set a new
  // password without the old one. Checked here too, because actions can be called
  // directly without loading the page.
  if (!(await isFreshEmailLinkSession())) {
    return { status: "error", message: "Your reset link has expired. Request a new one." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const message =
      error.code === "same_password"
        ? "Choose a password you haven’t used for this account before."
        : error.code === "weak_password"
          ? "Choose a stronger password: longer, and not a common one."
          : error.code === "session_not_found" ||
              error.code === "reauthentication_needed" ||
              error.status === 401
            ? "Your reset link has expired. Request a new one."
            : TRY_AGAIN;
    return { status: "error", message };
  }

  redirect("/");
}

export async function logOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

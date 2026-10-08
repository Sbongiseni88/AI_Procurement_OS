import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string };

/**
 * The verified JWT claims for this request, or null. `getClaims` verifies the token
 * instead of trusting the cookie (`getSession` would not), and `cache` makes repeat
 * calls within one request free.
 */
const getClaims = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return data.claims;
});

export async function getSessionUser(): Promise<SessionUser | null> {
  const claims = await getClaims();
  if (claims === null) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
}

/**
 * For pages and actions that need a signed-in user. `proxy.ts` already redirects
 * signed-out visitors, but it is a convenience, not the security boundary, so every
 * protected page checks again here.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user === null) redirect("/login");
  return user;
}

/** Sign-in methods Supabase records (in `amr`) for a session opened from an email link. */
const EMAIL_LINK_METHODS: ReadonlySet<string> = new Set(["otp", "recovery", "magiclink"]);
export const RESET_WINDOW_MINUTES = 15;

const AmrSchema = z.array(z.object({ method: z.string(), timestamp: z.number() }));

/**
 * True when this session was opened from an email link in the last
 * RESET_WINDOW_MINUTES. Setting a new password without the old one is only allowed
 * then: otherwise anyone at an unlocked, signed-in computer could take over the
 * account by changing its password.
 */
export async function isFreshEmailLinkSession(): Promise<boolean> {
  const claims = await getClaims();
  const amr = AmrSchema.safeParse(claims?.amr);
  if (!amr.success) return false;
  const cutoff = Date.now() / 1000 - RESET_WINDOW_MINUTES * 60;
  return amr.data.some(
    (entry) => EMAIL_LINK_METHODS.has(entry.method) && entry.timestamp >= cutoff,
  );
}

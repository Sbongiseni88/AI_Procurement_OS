import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { NO_STORE_HEADERS } from "@/lib/auth/cache-headers";
import { safeNextPath } from "@/lib/auth/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Landing route for links in auth emails (sign-up confirmation, password reset).
 *
 * Accepts both shapes Supabase can send:
 * - `?code=` — the PKCE flow behind the default email templates. Only works in the
 *   browser that asked for the email, because the code verifier is a cookie there.
 * - `?token_hash=&type=` — the server-side OTP flow, which works on any device. It
 *   needs the email templates changed to link here with `{{ .TokenHash }}`.
 *
 * The response sets session cookies, so it carries `Cache-Control: no-store`
 * (ARCHITECTURE.md §7).
 */
const OTP_TYPES = ["signup", "recovery", "invite", "magiclink", "email", "email_change"] as const;
const OtpTypeSchema = z.enum(OTP_TYPES) satisfies z.ZodType<EmailOtpType>;

function redirectTo(url: URL): NextResponse {
  return NextResponse.redirect(url, { headers: NO_STORE_HEADERS });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = OtpTypeSchema.safeParse(params.get("type"));

  const supabase = await createSupabaseServerClient();
  let ok = false;
  if (code !== null) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash !== null && type.success) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type.data })).error;
  }

  if (ok) return redirectTo(new URL(next, request.url));

  const login = new URL("/login", request.url);
  login.searchParams.set("error", "link");
  return redirectTo(login);
}

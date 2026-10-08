import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

/**
 * Test users for E2E journeys. Created with the admin client so no test depends on
 * receiving an email: Supabase's built-in mailer allows only a few messages an hour.
 * Every user is deleted by the fixture that made it, pass or fail.
 *
 * Deliberately not imported from `src/lib/supabase/admin.ts`, which is `server-only`.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env.local.`);
  return value;
}

export function adminClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestUser = { id: string; email: string; password: string };

/** A synthetic address on a reserved domain (RFC 2606), unique per call. */
export function testEmail(label: string): string {
  return `e2e-${label}-${randomUUID().slice(0, 8)}@example.com`;
}

export function testPassword(): string {
  return `E2e-${randomUUID()}`;
}

export async function createConfirmedUser(label = "user"): Promise<TestUser> {
  const email = testEmail(label);
  const password = testPassword();
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return { id: data.user.id, email, password };
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) throw new Error(`deleteUser ${id} failed: ${error.message}`);
}

export type TestMember = TestUser & { organizationId: string; organizationName: string };

/** A confirmed user who already has a workspace (organization, profile, active membership). */
export async function createMember(label = "member"): Promise<TestMember> {
  const admin = adminClient();
  const organizationName = `E2E Company ${randomUUID().slice(0, 8)}`;
  const org = await admin.from("organizations").insert({ name: organizationName }).select("id");
  const organizationId = org.data?.[0]?.id;
  if (org.error || typeof organizationId !== "string") {
    throw new Error(`organization insert failed: ${org.error?.message}`);
  }
  const user = await createConfirmedUser(label);
  const profile = await admin.from("profiles").insert({
    id: user.id,
    full_name: "E2E Member",
    active_organization_id: organizationId,
  });
  const membership = profile.error
    ? null
    : await admin
        .from("memberships")
        .insert({ organization_id: organizationId, user_id: user.id, role: "bid_manager" });
  const error = profile.error ?? membership?.error;
  if (error) {
    await deleteUser(user.id);
    await deleteOrganization(organizationId);
    throw new Error(`member setup failed: ${error.message}`);
  }
  return { ...user, organizationId, organizationName };
}

/** Deletes a user and every organization they were a member of. */
export async function deleteUserAndWorkspace(userId: string): Promise<void> {
  const admin = adminClient();
  const memberships = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", userId);
  if (memberships.error) throw new Error(`membership lookup failed: ${memberships.error.message}`);
  await deleteUser(userId);
  for (const row of memberships.data) {
    const organizationId: unknown = row.organization_id;
    if (typeof organizationId === "string") await deleteOrganization(organizationId);
  }
}

export async function deleteOrganization(id: string): Promise<void> {
  const { error } = await adminClient().from("organizations").delete().eq("id", id);
  if (error) throw new Error(`delete organization ${id} failed: ${error.message}`);
}

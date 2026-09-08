/**
 * RLS verification for T1.3.
 *
 * `tsc` cannot test SQL, so tenant isolation has to be proven against a real
 * database. This script provisions two organizations with one user each, then
 * asserts — as those users, over the wire, through PostgREST — that neither can
 * see or touch the other's data, and that neither can escalate their own role.
 *
 * It deliberately does NOT import from `src/lib/supabase/*`: the subject under
 * test is the database's policies, not the app's client wrappers.
 *
 * Run with:  npm run verify:rls
 * Fixtures are always torn down, including on failure.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    console.error(`Missing ${name}. Run via \`npm run verify:rls\` so .env.local is loaded.`);
    process.exit(1);
  }
  return value;
}

const URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const PUBLISHABLE = requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const SECRET = requireEnv("SUPABASE_SECRET_KEY");

const admin = createClient(URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Fresh suffix so repeated runs never collide on the unique email index. */
const RUN = Date.now().toString(36);
const PASSWORD = `Test-${RUN}-Aa1!`;

let checks = 0;
let failures = 0;

function check(label: string, passed: boolean, detail?: string): void {
  checks += 1;
  if (passed) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A client authenticated as a specific user, using the browser-safe key. */
async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

async function main(): Promise<void> {
  const created = { userIds: [] as string[], orgIds: [] as string[] };

  try {
    // ---- Fixtures (service_role; bypasses RLS by design) -------------------
    const orgs = await admin
      .from("organizations")
      .insert([{ name: `Alpha Bidders ${RUN}` }, { name: `Beta Contractors ${RUN}` }])
      .select("id, name");
    if (orgs.error) throw new Error(`org insert failed: ${orgs.error.message}`);

    const orgA = orgs.data[0];
    const orgB = orgs.data[1];
    if (!orgA || !orgB) throw new Error("expected two organizations");
    created.orgIds.push(orgA.id, orgB.id);

    const emailA = `rls-a-${RUN}@example.com`;
    const emailB = `rls-b-${RUN}@example.com`;

    const userIdByEmail = new Map<string, string>();
    for (const [email, orgId, role] of [
      [emailA, orgA.id, "bid_manager"],
      [emailB, orgB.id, "pricing_specialist"],
    ] as const) {
      const u = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (u.error || !u.data.user) throw new Error(`createUser failed: ${u.error?.message}`);
      created.userIds.push(u.data.user.id);
      userIdByEmail.set(email, u.data.user.id);

      const p = await admin
        .from("profiles")
        .insert({ id: u.data.user.id, organization_id: orgId, role, full_name: email });
      if (p.error) throw new Error(`profile insert failed: ${p.error.message}`);
    }

    const userA = userIdByEmail.get(emailA);
    if (userA === undefined) throw new Error("user A was not created");

    console.log(`\nFixtures: org A=${orgA.id.slice(0, 8)} org B=${orgB.id.slice(0, 8)}\n`);

    // ---- Tenant isolation, as user A (bid_manager in org A) ----------------
    console.log("Tenant isolation — user A (bid_manager, org A):");
    const a = await signIn(emailA);

    const aOrgs = await a.from("organizations").select("id, name");
    check(
      "sees exactly one organization (its own)",
      !aOrgs.error && aOrgs.data?.length === 1 && aOrgs.data[0]?.id === orgA.id,
      aOrgs.error?.message ?? `got ${aOrgs.data?.length} rows`,
    );

    const aOrgB = await a.from("organizations").select("id").eq("id", orgB.id);
    check(
      "cannot read the other tenant's organization by id",
      !aOrgB.error && aOrgB.data?.length === 0,
      aOrgB.error?.message ?? `got ${aOrgB.data?.length} rows`,
    );

    const aProfiles = await a.from("profiles").select("id, organization_id");
    check(
      "sees only profiles within its own organization",
      !aProfiles.error &&
        aProfiles.data?.length === 1 &&
        aProfiles.data.every((r) => r.organization_id === orgA.id),
      aProfiles.error?.message ?? `got ${aProfiles.data?.length} rows`,
    );

    // ---- Privilege escalation attempts -------------------------------------
    console.log("\nPrivilege escalation — user A:");
    const selfName = await a.from("profiles").update({ full_name: "Renamed" }).eq("id", userA);
    check("may update its own full_name", !selfName.error, selfName.error?.message);

    const selfRole = await a
      .from("profiles")
      .update({ role: "executive_approver" })
      .eq("id", userA);
    check(
      "CANNOT promote itself to executive_approver",
      selfRole.error !== null,
      selfRole.error ? `blocked: ${selfRole.error.code}` : "UPDATE SUCCEEDED — CRITICAL",
    );

    const selfOrg = await a.from("profiles").update({ organization_id: orgB.id }).eq("id", userA);
    check(
      "CANNOT move itself into the other organization",
      selfOrg.error !== null,
      selfOrg.error ? `blocked: ${selfOrg.error.code}` : "UPDATE SUCCEEDED — CRITICAL",
    );

    const newOrg = await a.from("organizations").insert({ name: "Rogue Org" });
    check(
      "CANNOT create an organization",
      newOrg.error !== null,
      newOrg.error ? `blocked: ${newOrg.error.code}` : "INSERT SUCCEEDED — CRITICAL",
    );

    const otherOrgUpdate = await a
      .from("organizations")
      .update({ name: "Hijacked" })
      .eq("id", orgB.id)
      .select("id");
    check(
      "CANNOT rename the other tenant's organization",
      otherOrgUpdate.error !== null || otherOrgUpdate.data?.length === 0,
      `affected ${otherOrgUpdate.data?.length ?? 0} rows`,
    );

    // ---- Role-based write access on organizations --------------------------
    console.log("\nRBAC on organizations:");
    const aOwnOrgUpdate = await a
      .from("organizations")
      .update({ name: `Alpha Bidders ${RUN} (edited)` })
      .eq("id", orgA.id)
      .select("id");
    check(
      "bid_manager MAY update its own organization",
      !aOwnOrgUpdate.error && aOwnOrgUpdate.data?.length === 1,
      aOwnOrgUpdate.error?.message ?? `affected ${aOwnOrgUpdate.data?.length} rows`,
    );

    const b = await signIn(emailB);
    const bOwnOrgUpdate = await b
      .from("organizations")
      .update({ name: "Beta renamed by specialist" })
      .eq("id", orgB.id)
      .select("id");
    check(
      "pricing_specialist may NOT update its own organization",
      bOwnOrgUpdate.error !== null || bOwnOrgUpdate.data?.length === 0,
      `affected ${bOwnOrgUpdate.data?.length ?? 0} rows`,
    );

    // ---- Anonymous access ---------------------------------------------------
    console.log("\nAnonymous (no session):");
    const anon = createClient(URL, PUBLISHABLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonOrgs = await anon.from("organizations").select("id");
    check(
      "anonymous callers see no organizations",
      anonOrgs.error !== null || anonOrgs.data?.length === 0,
      anonOrgs.error ? `blocked: ${anonOrgs.error.code}` : `got ${anonOrgs.data?.length} rows`,
    );
    const anonProfiles = await anon.from("profiles").select("id");
    check(
      "anonymous callers see no profiles",
      anonProfiles.error !== null || anonProfiles.data?.length === 0,
      anonProfiles.error
        ? `blocked: ${anonProfiles.error.code}`
        : `got ${anonProfiles.data?.length} rows`,
    );
  } finally {
    // ---- Teardown ----------------------------------------------------------
    console.log("\nTeardown:");
    for (const id of created.userIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      console.log(
        `  user ${id.slice(0, 8)} ${error ? `NOT deleted: ${error.message}` : "deleted"}`,
      );
    }
    // Profiles cascade with the user; organizations must go explicitly.
    for (const id of created.orgIds) {
      const { error } = await admin.from("organizations").delete().eq("id", id);
      console.log(
        `  org  ${id.slice(0, 8)} ${error ? `NOT deleted: ${error.message}` : "deleted"}`,
      );
    }
  }

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) {
    console.error(`${failures} FAILED — tenant isolation is not intact.`);
    process.exit(1);
  }
  console.log("Tenant isolation verified.");
}

main().catch((e: unknown) => {
  console.error("\nverify-rls crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});

/**
 * RLS verification (T1.3, extended per ticket: E1.4 onboarding, E1.5 audit log).
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
/** Teardown problems: not an isolation failure, but the run must still not pass. */
let cleanupFailures = 0;

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

    // ---- Onboarding (E1.4) ---------------------------------------------------
    console.log("\nOnboarding — complete_onboarding():");

    /** A confirmed user with NO profile, i.e. someone who has just signed up. */
    async function createNewcomer(label: string): Promise<string> {
      const email = `rls-${label}-${RUN}@example.com`;
      const u = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (u.error || !u.data.user) throw new Error(`createUser failed: ${u.error?.message}`);
      created.userIds.push(u.data.user.id);
      return email;
    }

    async function orgsNamed(name: string): Promise<number> {
      const r = await admin.from("organizations").select("id").eq("name", name);
      if (r.error) throw new Error(`org lookup failed: ${r.error.message}`);
      return r.data.length;
    }

    const aAgain = await a.rpc("complete_onboarding", {
      company_name: `Alpha Second ${RUN}`,
      full_name: "A again",
    });
    check(
      "a user who already has a profile CANNOT onboard again",
      aAgain.error !== null && (await orgsNamed(`Alpha Second ${RUN}`)) === 0,
      aAgain.error ? `blocked: ${aAgain.error.code}` : "SECOND WORKSPACE CREATED — CRITICAL",
    );

    const c = await signIn(await createNewcomer("c"));
    const cBefore = await c.from("organizations").select("id");
    check(
      "a newcomer without a profile sees no organizations (fails closed)",
      !cBefore.error && cBefore.data?.length === 0,
      cBefore.error?.message ?? `got ${cBefore.data?.length} rows`,
    );

    const cOnboard = await c.rpc("complete_onboarding", {
      company_name: `  Gamma Supplies ${RUN}  `,
      full_name: "Casey",
    });
    if (typeof cOnboard.data === "string") created.orgIds.push(cOnboard.data);
    const cOrgs = await c.from("organizations").select("id, name");
    const cProfile = await c.from("profiles").select("organization_id, role, full_name");
    check(
      "a newcomer creates exactly one workspace and becomes its executive_approver",
      !cOnboard.error &&
        cOrgs.data?.length === 1 &&
        cOrgs.data[0]?.id === cOnboard.data &&
        cOrgs.data[0]?.name === `Gamma Supplies ${RUN}` &&
        cProfile.data?.length === 1 &&
        cProfile.data[0]?.organization_id === cOnboard.data &&
        cProfile.data[0]?.role === "executive_approver",
      cOnboard.error?.message ?? `orgs=${cOrgs.data?.length} profiles=${cProfile.data?.length}`,
    );

    const cAgain = await c.rpc("complete_onboarding", {
      company_name: `Gamma Second ${RUN}`,
      full_name: "Casey",
    });
    const cOrgsAfter = await c.from("organizations").select("id");
    check(
      "the same user CANNOT create a second workspace",
      cAgain.error !== null &&
        (await orgsNamed(`Gamma Second ${RUN}`)) === 0 &&
        cOrgsAfter.data?.length === 1,
      cAgain.error ? `blocked: ${cAgain.error.code}` : "SECOND WORKSPACE CREATED — CRITICAL",
    );

    const cId = (await c.auth.getUser()).data.user?.id ?? "";
    const cJoin = await c.from("profiles").update({ organization_id: orgA.id }).eq("id", cId);
    const cSeesA = await c.from("organizations").select("id").eq("id", orgA.id);
    check(
      "an onboarded user CANNOT move into another company afterwards",
      cJoin.error !== null && cSeesA.data?.length === 0,
      cJoin.error ? `blocked: ${cJoin.error.code}` : "PROFILE MOVED — CRITICAL",
    );

    const d = await signIn(await createNewcomer("d"));
    // Spaces, and whitespace Postgres `trim()` alone would not strip (tabs, newlines).
    const blanks = await Promise.all(
      ["   ", "\t\n", "\r\n\t "].map((blank) =>
        d.rpc("complete_onboarding", { company_name: blank, full_name: "Dana" }),
      ),
    );
    const blankName = await d.rpc("complete_onboarding", {
      company_name: `Delta Named ${RUN}`,
      full_name: "\t\n",
    });
    const dProfile = await d.from("profiles").select("id");
    check(
      "blank company or person names (any whitespace) are refused and leave nothing behind",
      blanks.every((r) => r.error !== null) &&
        blankName.error !== null &&
        dProfile.data?.length === 0 &&
        (await orgsNamed(`Delta Named ${RUN}`)) === 0,
      blanks.map((r) => r.error?.code ?? "CREATED").join(",") + ` / ${blankName.error?.code}`,
    );

    const dPrivate = await d
      .schema("private")
      .rpc("create_workspace", { company_name: `Delta ${RUN}`, full_name: "Dana" });
    const dDirect = await fetch(`${URL}/rest/v1/rpc/create_workspace`, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE,
        Authorization: `Bearer ${(await d.auth.getSession()).data.session?.access_token ?? ""}`,
        "Content-Type": "application/json",
        "Content-Profile": "private",
      },
      body: JSON.stringify({ company_name: `Delta ${RUN}`, full_name: "Dana" }),
    });
    check(
      "the SECURITY DEFINER function is not reachable through the API",
      dPrivate.error !== null && !dDirect.ok && (await orgsNamed(`Delta ${RUN}`)) === 0,
      `schema('private'): ${dPrivate.error?.code ?? "ok"}; direct: HTTP ${dDirect.status}`,
    );

    // ---- Audit log (E1.5) ---------------------------------------------------
    console.log("\nAudit log — audit_events:");
    const seeded = await admin
      .from("audit_events")
      .insert([
        {
          organization_id: orgA.id,
          actor_id: userA,
          action: "workspace.created",
          entity_type: "organization",
          entity_id: orgA.id,
        },
        {
          organization_id: orgB.id,
          action: "workspace.created",
          entity_type: "organization",
          entity_id: orgB.id,
        },
      ])
      .select("id, organization_id");
    if (seeded.error) throw new Error(`audit seed failed: ${seeded.error.message}`);
    const eventA = seeded.data.find((e) => e.organization_id === orgA.id)?.id;
    const eventB = seeded.data.find((e) => e.organization_id === orgB.id)?.id;
    if (eventA === undefined || eventB === undefined) throw new Error("audit seed incomplete");

    const aEvents = await a.from("audit_events").select("id, organization_id");
    check(
      "a member reads its own organization's events only",
      !aEvents.error &&
        aEvents.data.some((e) => e.id === eventA) &&
        aEvents.data.every((e) => e.organization_id === orgA.id),
      aEvents.error?.message ?? `got ${aEvents.data?.length} rows`,
    );

    const aReadsB = await a.from("audit_events").select("id").eq("id", eventB);
    check(
      "a member CANNOT read another company's events",
      !aReadsB.error && aReadsB.data.length === 0,
      aReadsB.error?.message ?? `got ${aReadsB.data?.length} rows`,
    );

    const aInsert = await a.from("audit_events").insert({
      organization_id: orgA.id,
      actor_id: userA,
      action: "workspace.created",
      entity_type: "organization",
    });
    check(
      "a member CANNOT write an event directly (no forged entries)",
      aInsert.error !== null,
      aInsert.error ? `blocked: ${aInsert.error.code}` : "INSERT SUCCEEDED — CRITICAL",
    );

    const aUpdate = await a
      .from("audit_events")
      .update({ action: "workspace.renamed" })
      .eq("id", eventA)
      .select("id");
    const aDelete = await a.from("audit_events").delete().eq("id", eventA).select("id");
    check(
      "a member CANNOT update or delete its own organization's events",
      (aUpdate.error !== null || aUpdate.data?.length === 0) &&
        (aDelete.error !== null || aDelete.data?.length === 0),
      `update: ${aUpdate.error?.code ?? aUpdate.data?.length}; delete: ${aDelete.error?.code ?? aDelete.data?.length}`,
    );

    const svcUpdate = await admin
      .from("audit_events")
      .update({ action: "workspace.renamed" })
      .eq("id", eventA)
      .select("id");
    const svcDelete = await admin.from("audit_events").delete().eq("id", eventA).select("id");
    const stillThere = await admin.from("audit_events").select("action").eq("id", eventA).single();
    check(
      "even the service role CANNOT update or delete an event",
      svcUpdate.error !== null &&
        svcDelete.error !== null &&
        stillThere.data?.action === "workspace.created",
      `update: ${svcUpdate.error?.code ?? "ALLOWED"}; delete: ${svcDelete.error?.code ?? "ALLOWED"}`,
    );

    const cEvents = await c.from("audit_events").select("id");
    check(
      "a member of a third company sees none of these events",
      !cEvents.error && !cEvents.data.some((e) => e.id === eventA || e.id === eventB),
      cEvents.error?.message ?? `got ${cEvents.data?.length} rows`,
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
    const anonOnboard = await anon.rpc("complete_onboarding", {
      company_name: `Anon ${RUN}`,
      full_name: "Anon",
    });
    check(
      "anonymous callers CANNOT run onboarding",
      anonOnboard.error !== null && (await orgsNamed(`Anon ${RUN}`)) === 0,
      anonOnboard.error ? `blocked: ${anonOnboard.error.code}` : "ANON WORKSPACE CREATED",
    );
    const anonEvents = await anon.from("audit_events").select("id");
    check(
      "anonymous callers see no audit events",
      anonEvents.error !== null || anonEvents.data?.length === 0,
      anonEvents.error
        ? `blocked: ${anonEvents.error.code}`
        : `got ${anonEvents.data?.length} rows`,
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
      if (error) cleanupFailures += 1;
      console.log(
        `  user ${id.slice(0, 8)} ${error ? `NOT deleted: ${error.message}` : "deleted"}`,
      );
    }
    // Profiles cascade with the user; organizations must go explicitly. Sweep by the
    // run suffix too, so an organization from a call that wrongly succeeded is removed.
    const swept = await admin.from("organizations").select("id").like("name", `%${RUN}%`);
    for (const row of swept.data ?? []) {
      if (!created.orgIds.includes(row.id)) created.orgIds.push(row.id);
    }
    for (const id of created.orgIds) {
      // Their audit events cascade with them (the one deletion audit_events allows).
      const { error } = await admin.from("organizations").delete().eq("id", id);
      if (error) cleanupFailures += 1;
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
  if (cleanupFailures > 0) {
    console.error(`${cleanupFailures} fixture(s) NOT cleaned up — see Teardown above.`);
    process.exit(1);
  }
  console.log("Tenant isolation verified.");
}

main().catch((e: unknown) => {
  console.error("\nverify-rls crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});

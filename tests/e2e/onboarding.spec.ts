import { expect, logInViaForm, test } from "./support/fixtures";
import { adminClient, deleteUserAndWorkspace, testEmail, testPassword } from "./support/users";

test("sign up, confirm the email, set up the workspace, land in it", async ({ page }) => {
  const email = testEmail("signup");
  // `generateLink` creates the unconfirmed account and returns the confirmation link
  // the sign-up email would carry, without sending it (Supabase's built-in mailer
  // allows only a few emails an hour).
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: "signup",
    email,
    password: testPassword(),
  });
  expect(error).toBeNull();
  const userId = data.user?.id;
  expect(userId).toBeDefined();

  try {
    const tokenHash = data.properties?.hashed_token ?? "";
    await page.goto(`/auth/callback?token_hash=${tokenHash}&type=signup&next=/`);
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();

    const company = `Thabo Civils ${Date.now()} (Pty) Ltd`;
    await page.getByLabel("Company name").fill(company);
    await page.getByLabel("Your name").fill("Thabo Mokoena");
    await page.getByRole("button", { name: "Create workspace" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await page.getByRole("button", { name: /account menu/ }).click();
    await expect(page.getByText(`Executive approver at ${company}`)).toBeVisible();

    // Onboarding is audit-logged (E1.5): one event, by this person, for this company.
    const { data: events } = await adminClient()
      .from("audit_events")
      .select("action, entity_type, entity_id, organization_id, details")
      .eq("actor_id", userId ?? "");
    expect(events).toHaveLength(1);
    const [event] = events ?? [];
    expect(event).toMatchObject({
      action: "workspace.created",
      entity_type: "organization",
      details: { organizationName: company, role: "executive_approver" },
    });
    expect(event?.entity_id).toBe(event?.organization_id);

    // ...and recorded as a domain event (E1.5.5), for jobs and future agents.
    const { data: domainEvents } = await adminClient()
      .from("domain_events")
      .select("type, entity_type, entity_id, actor_id")
      .eq("organization_id", event?.organization_id ?? "");
    expect(domainEvents).toEqual([
      {
        type: "workspace.created",
        entity_type: "organization",
        entity_id: event?.organization_id,
        actor_id: userId,
      },
    ]);

    // Onboarding is done once: going back to it returns to the workspace.
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/$/);
  } finally {
    if (userId) await deleteUserAndWorkspace(userId);
  }
});

test("a signed-in user without a workspace is sent to onboarding", async ({ page, newcomer }) => {
  await logInViaForm(page, newcomer);
  await expect(page).toHaveURL(/\/onboarding$/);

  // Someone signed in to the wrong account can leave without creating a workspace.
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("onboarding asks for both names before creating anything", async ({ page, newcomer }) => {
  await logInViaForm(page, newcomer);
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Your name").fill("Lerato");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByText("Enter your company’s name.")).toBeVisible();
  await expect(page.getByLabel("Company name")).toBeFocused();
  await expect(page.getByLabel("Your name")).toHaveValue("Lerato");
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("a member who has a workspace skips onboarding", async ({ page, member }) => {
  await logInViaForm(page, member);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/$/);
});

test("a person whose memberships were all removed is told to ask for access, not onboarded again", async ({
  page,
  member,
}) => {
  const { error } = await adminClient()
    .from("memberships")
    .update({ status: "removed" })
    .eq("user_id", member.id);
  expect(error).toBeNull();

  await logInViaForm(page, member);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "No active company" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create workspace" })).toHaveCount(0);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("a person in two companies works in the one they selected, with that company's role", async ({
  page,
  member,
}) => {
  const admin = adminClient();
  const second = `E2E Second Company ${Date.now()}`;
  const org = await admin.from("organizations").insert({ name: second }).select("id").single();
  expect(org.error).toBeNull();
  const secondId: unknown = org.data?.id;
  if (typeof secondId !== "string") throw new Error("second company was not created");
  // Added before anything can fail, so the fixture's cleanup removes the company too.
  const joined = await admin
    .from("memberships")
    .insert({ organization_id: secondId, user_id: member.id, role: "pricing_specialist" });
  expect(joined.error).toBeNull();

  await logInViaForm(page, member);
  await page.getByRole("button", { name: /account menu/ }).click();
  await expect(page.getByText(`Bid manager at ${member.organizationName}`)).toBeVisible();

  const selected = await admin
    .from("profiles")
    .update({ active_organization_id: secondId })
    .eq("id", member.id);
  expect(selected.error).toBeNull();
  await page.goto("/settings");
  await page.getByRole("button", { name: /account menu/ }).click();
  await expect(page.getByText(`Pricing specialist at ${second}`)).toBeVisible();
  await expect(page.getByText(member.organizationName)).toHaveCount(0);
});

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
    await expect(page.getByRole("heading", { level: 1, name: company })).toBeVisible();
    await expect(page.getByText("Executive approver")).toBeVisible();

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
  await expect(
    page.getByRole("heading", { level: 1, name: member.organizationName }),
  ).toBeVisible();
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/$/);
});

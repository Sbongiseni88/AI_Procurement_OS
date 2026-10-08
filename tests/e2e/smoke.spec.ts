import { expect, logInViaForm, logOutViaMenu, test } from "./support/fixtures";
import { adminClient, deleteUserAndWorkspace, testEmail, testPassword } from "./support/users";

/**
 * The end-to-end smoke journey (E1.9): sign up, confirm, onboard, dashboard, log out,
 * log in again. Runs in the normal suite against `next start`, and against a
 * deployment with:
 *
 *   PLAYWRIGHT_BASE_URL=https://ai-procurement-os.vercel.app npx playwright test smoke
 *
 * The account is created through the admin API (`generateLink`), which returns the
 * confirmation link without sending an email, and is deleted afterwards, with its
 * workspace, whatever the outcome.
 */
test("@smoke sign up, onboard, use the dashboard, log out and back in", async ({ page }) => {
  const email = testEmail("smoke");
  const password = testPassword();
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: "signup",
    email,
    password,
  });
  expect(error).toBeNull();
  const userId = data.user?.id;
  expect(userId).toBeDefined();

  try {
    await page.goto(
      `/auth/callback?token_hash=${data.properties?.hashed_token ?? ""}&type=signup&next=/`,
    );
    await expect(page).toHaveURL(/\/onboarding$/);

    const company = `Smoke Test Supplies ${Date.now()}`;
    await page.getByLabel("Company name").fill(company);
    await page.getByLabel("Your name").fill("Smoke Test");
    await page.getByRole("button", { name: "Create workspace" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByText(company).first()).toBeVisible();

    await logOutViaMenu(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    await logInViaForm(page, { email, password });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  } finally {
    if (userId) await deleteUserAndWorkspace(userId);
  }
});

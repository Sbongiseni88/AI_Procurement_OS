import { type Page } from "@playwright/test";

import { expect, logInViaForm, test } from "./support/fixtures";
import { adminClient, deleteUser, testEmail, testPassword } from "./support/users";

/**
 * Records every response that writes a Supabase auth cookie (`sb-…`), so a test can
 * assert they are all marked uncacheable. A CDN caching one of them would hand one
 * user's session to the next visitor (ARCHITECTURE.md §7).
 */
function recordAuthCookieResponses(page: Page): Promise<AuthCookieResponse[]>[] {
  const seen: Promise<AuthCookieResponse[]>[] = [];
  page.on("response", (response) => {
    // `allHeaders()`, not `headers()`: Playwright leaves Set-Cookie out of the latter.
    seen.push(
      response
        .allHeaders()
        .then((headers) =>
          /(^|\n)sb-/.test(headers["set-cookie"] ?? "")
            ? [{ label: `${response.request().method()} ${response.url()}`, headers }]
            : [],
        ),
    );
  });
  return seen;
}

type AuthCookieResponse = { label: string; headers: Record<string, string> };

async function expectNoStore(recorded: Promise<AuthCookieResponse[]>[]) {
  const responses = (await Promise.all(recorded)).flat();
  expect(responses.length, "expected at least one response to set an auth cookie").toBeGreaterThan(
    0,
  );
  for (const { label, headers } of responses) {
    expect(headers["cache-control"] ?? "", label).toContain("no-store");
  }
}

test.describe("signed out", () => {
  test("visiting the app sends you to log in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  });

  test("a protected page is remembered as the place to return to", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/login\?next=%2Freset-password$/);
  });

  test("a broken email link explains what to do", async ({ page }) => {
    await page.goto("/auth/callback?token_hash=not-a-real-token&type=recovery");
    await expect(page).toHaveURL(/\/login\?error=link$/);
    await expect(page.locator("form").getByRole("status")).toContainText("That link has expired");
  });

  test("sign-up checks the password before creating anything", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Work email").fill(testEmail("short-pw"));
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
    await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("with an account", () => {
  test("log in, see your account, log out", async ({ page, confirmedUser }) => {
    const authResponses = recordAuthCookieResponses(page);

    await logInViaForm(page, confirmedUser);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(confirmedUser.email)).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    // Log-in and log-out both write auth cookies; every such response must be no-store.
    await expectNoStore(authResponses);
  });

  test("a wrong password is refused and keeps the email", async ({ page, confirmedUser }) => {
    await logInViaForm(page, { email: confirmedUser.email, password: "not-the-password" });
    // Scoped to the form: Next's route announcer is also role="alert".
    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "That email and password don’t match an account.",
    );
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("Email")).toHaveValue(confirmedUser.email);
  });

  test("a password log-in cannot set a new password without a reset link", async ({
    page,
    confirmedUser,
  }) => {
    await logInViaForm(page, confirmedUser);
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/reset-password");
    await expect(
      page.getByRole("heading", { name: "Use the link in your reset email" }),
    ).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  });

  test("a signed-in visitor skips the log-in page", async ({ page, confirmedUser }) => {
    await logInViaForm(page, confirmedUser);
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/$/);

    // A tab before the second slash is dropped by URL parsing; must not leave the site.
    await page.goto("/login?next=/%09/evil.example");
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$|^https:\/\/[^/]+\/$/);
    expect(new URL(page.url()).hostname).not.toBe("evil.example");
  });

  test("log in returns you to the page you asked for, never another site", async ({
    page,
    confirmedUser,
  }) => {
    await page.goto("/login?next=//evil.example/steal");
    await page.getByLabel("Email").fill(confirmedUser.email);
    await page.getByLabel("Password").fill(confirmedUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$|^https:\/\/[^/]+\/$/);
  });

  test("reset a forgotten password from the email link", async ({ page, confirmedUser }) => {
    // The link Supabase would email, generated directly so no email is sent.
    const { data, error } = await adminClient().auth.admin.generateLink({
      type: "recovery",
      email: confirmedUser.email,
    });
    expect(error).toBeNull();
    const tokenHash = data.properties?.hashed_token ?? "";
    const authResponses = recordAuthCookieResponses(page);

    await page.goto(`/auth/callback?token_hash=${tokenHash}&type=recovery&next=/reset-password`);
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    await expectNoStore(authResponses);

    const newPassword = testPassword();
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Repeat new password").fill(newPassword);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await logInViaForm(page, { email: confirmedUser.email, password: newPassword });
    await expect(page.getByText(confirmedUser.email)).toBeVisible();
  });
});

test("confirming a sign-up from the email link signs you in", async ({ page }) => {
  const email = testEmail("signup");
  // `generateLink` creates the unconfirmed account and returns the confirmation link
  // the sign-up email would carry, without sending it.
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
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(email)).toBeVisible();
  } finally {
    if (userId) await deleteUser(userId);
  }
});

import { test as base, expect, type Page } from "@playwright/test";

import { createConfirmedUser, deleteUser, type TestUser } from "./users";

export { expect };

/** `confirmedUser`: a fresh, email-confirmed account, deleted after the test. */
export const test = base.extend<{ confirmedUser: TestUser }>({
  // `provide` is Playwright's `use` callback, renamed so React's hooks lint rule does
  // not mistake it for React's `use()`.
  confirmedUser: async ({}, provide) => {
    const user = await createConfirmedUser();
    try {
      await provide(user);
    } finally {
      await deleteUser(user.id);
    }
  },
});

export async function logInViaForm(page: Page, user: Pick<TestUser, "email" | "password">) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
}

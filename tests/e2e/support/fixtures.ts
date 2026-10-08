import { test as base, expect, type Page } from "@playwright/test";

import {
  createConfirmedUser,
  createMember,
  deleteUserAndWorkspace,
  type TestMember,
  type TestUser,
} from "./users";

export { expect };

/**
 * `member`: a confirmed user who already has a workspace.
 * `newcomer`: a confirmed user who has not been through onboarding yet.
 * Both are deleted after the test, with any workspace they own, pass or fail.
 *
 * `provide` is Playwright's `use` callback, renamed so React's hooks lint rule does
 * not mistake it for React's `use()`.
 */
export const test = base.extend<{ member: TestMember; newcomer: TestUser }>({
  member: async ({}, provide) => {
    const member = await createMember();
    try {
      await provide(member);
    } finally {
      await deleteUserAndWorkspace(member.id);
    }
  },
  newcomer: async ({}, provide) => {
    const user = await createConfirmedUser("newcomer");
    try {
      await provide(user);
    } finally {
      await deleteUserAndWorkspace(user.id);
    }
  },
});

export async function logInViaForm(page: Page, user: Pick<TestUser, "email" | "password">) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
}

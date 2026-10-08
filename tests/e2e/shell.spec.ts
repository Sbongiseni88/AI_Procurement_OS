import { expect, logInViaForm, test } from "./support/fixtures";

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the sidebar moves between the workspace pages", async ({ page, member }) => {
    await logInViaForm(page, member);
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    for (const [label, path, heading] of [
      ["Tenders", "/tenders", "Tenders"],
      ["Company documents", "/documents", "Company documents"],
      ["Settings", "/settings", "Settings"],
      ["Dashboard", "/", "Dashboard"],
    ] as const) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/" : path}$`));
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    }
  });

  test("the account menu shows who is signed in and closes with Escape", async ({
    page,
    member,
  }) => {
    await logInViaForm(page, member);
    await expect(page.getByText(member.organizationName).first()).toBeVisible();

    await page.getByRole("button", { name: /account menu/ }).click();
    await expect(page.getByText(member.email)).toBeVisible();
    await expect(page.getByText(`Bid manager at ${member.organizationName}`)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText(member.email)).toBeHidden();

    // Following a link in the menu closes it.
    await page.getByRole("button", { name: /account menu/ }).click();
    await page.getByRole("link", { name: "Settings" }).last().click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText(`Bid manager at ${member.organizationName}`)).toBeHidden();
  });

  test("settings shows the company and the signed-in account", async ({ page, member }) => {
    await logInViaForm(page, member);
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/settings");
    await expect(page.locator("dd", { hasText: member.organizationName })).toBeVisible();
    await expect(page.locator("dd", { hasText: member.email })).toBeVisible();
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("navigation opens as a drawer and closes after choosing a page", async ({
    page,
    member,
  }) => {
    await logInViaForm(page, member);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    // The desktop sidebar is hidden; the menu button is the way in.
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();

    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawerNav = page.getByRole("navigation", { name: "Main" });
    await expect(drawerNav).toBeVisible();
    await drawerNav.getByRole("link", { name: "Company documents" }).click();

    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByRole("heading", { level: 1, name: "Company documents" })).toBeVisible();
    await expect(drawerNav).toBeHidden();
  });

  test("no page scrolls sideways at phone width", async ({ page, member }) => {
    await logInViaForm(page, member);
    await expect(page).toHaveURL(/\/$/);
    for (const path of ["/", "/tenders", "/documents", "/settings"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

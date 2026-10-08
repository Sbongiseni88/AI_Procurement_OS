import { expect, logInViaForm, test } from "./support/fixtures";

test("a new workspace's dashboard shows real empty states and next steps", async ({
  page,
  member,
}) => {
  await logInViaForm(page, member);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  const setup = page.getByRole("region", { name: "Getting started" });
  await expect(setup.getByText("Create your workspace (done)")).toBeAttached();
  await expect(setup.getByText("Upload a tender (not done yet)")).toBeAttached();

  await expect(page.getByText("No tenders yet. Upload your first tender")).toBeVisible();
  await expect(page.getByText("No company documents yet.")).toBeVisible();

  // The status legend lists the whole Phase 1 set.
  const legend = page.getByRole("region", { name: "What the statuses mean" });
  await expect(legend.getByRole("term")).toHaveCount(7);
  await expect(legend.getByText("Needs verification", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Go to tenders" }).click();
  await expect(page).toHaveURL(/\/tenders$/);
});

test("the tender board has a column per stage and no sample tenders", async ({ page, member }) => {
  await logInViaForm(page, member);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/tenders");

  await expect(page.getByRole("heading", { name: "No tenders yet" })).toBeVisible();
  const stages = page.getByRole("list", { name: "Tender stages" }).getByRole("listitem");
  await expect(stages).toHaveCount(4);
  for (const label of ["Reading", "To review", "Checking compliance", "Compliance checked"]) {
    const column = stages.filter({ has: page.getByRole("heading", { name: label, exact: true }) });
    await expect(column.getByText("No tenders here.")).toBeVisible();
    await expect(column.getByText("0 tenders")).toBeAttached();
  }

  // Upload opens in E3: the button is visibly there but says why it cannot be used yet.
  const upload = page.getByRole("button", { name: "Upload a tender" });
  await expect(upload).toBeDisabled();
  await expect(upload).toHaveAccessibleDescription(
    "Tender upload opens after company documents, in a later release.",
  );
});

import { expect, test } from "./fixtures";
import { installSyntheticWorkspace } from "./synthetic-workspace";

test("exposes built-in help and keyboard-operable workspace selection", async ({
  page,
}) => {
  await installSyntheticWorkspace(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Built-in help" }),
  ).toBeVisible();
  await expect(page.getByText("Keyboard shortcuts")).toBeVisible();
  await expect(page.getByText("Local PII handling")).toBeVisible();

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator("button:focus")).toHaveText(
    "Select local workspace",
  );

  await page.keyboard.press("Enter");
  await page.getByLabel("Reviewer identifier").fill("keyboard-reviewer");
  await page
    .getByLabel("Reviewer display name")
    .fill("Keyboard Accessible Reviewer");
  await page.getByLabel("Case number").fill("PBGC-ACCESSIBILITY-001");
  await page.getByRole("button", { name: "Create production case" }).click();

  await expect(page.getByText("Workspace ready")).toBeVisible();
});

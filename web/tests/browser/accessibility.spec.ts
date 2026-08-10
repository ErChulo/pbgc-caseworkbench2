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

  const workspaceButton = page.getByRole("button", {
    name: "Select local workspace",
  });
  await workspaceButton.focus();
  await expect(workspaceButton).toBeFocused();

  await page.keyboard.press("Enter");
  await page.getByLabel("Reviewer identifier").fill("keyboard-reviewer");
  await page
    .getByLabel("Reviewer display name")
    .fill("Keyboard Accessible Reviewer");
  await page.getByRole("button", { name: "Establish identity" }).click();
  await page.getByLabel("Case number").fill("PBGC-ACCESSIBILITY-001");
  await page.getByRole("button", { name: "Create production case" }).click();

  await expect(page.getByTestId("active-case-authoritative-id")).toHaveText(
    "PBGC-ACCESSIBILITY-001",
  );
});

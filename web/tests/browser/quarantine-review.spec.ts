import { expect, test } from "./fixtures";
import { installSyntheticWorkspace } from "./synthetic-workspace";

async function createSyntheticCase(page: import("@playwright/test").Page) {
  await installSyntheticWorkspace(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Select local workspace" }).click();
  await page.getByLabel("Reviewer identifier").fill("synthetic-reviewer");
  await page.getByLabel("Reviewer display name").fill("Synthetic Reviewer");
  await page.getByLabel("Case number").fill("PBGC-SYNTHETIC-QUARANTINE");
  await page.getByRole("button", { name: "Create production case" }).click();
}

test("separates accounting, provisional security, and typed human disposition", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page);
  const picker = page.getByLabel("Select individual files");
  const riskyBytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
  await picker.setInputFiles([
    {
      name: "synthetic-risk.exe",
      mimeType: "application/octet-stream",
      buffer: riskyBytes,
    },
    {
      name: "unaffected.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("synthetic safe sibling"),
    },
  ]);
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Quarantine queue" }),
  ).toBeVisible();
  const quarantine = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Quarantine queue" }),
  });
  await expect(quarantine.getByText("pending-human-disposition")).toBeVisible();
  await expect(quarantine.getByText("Safety review needed")).toBeVisible();
  await expect(quarantine.getByText("No decision yet", { exact: true })).toBeVisible();
  await expect(quarantine.getByText("executable")).toBeVisible();
  await expect(
    page.getByText(/authorized reviewer must check/iu),
  ).toBeVisible();

  await quarantine.getByLabel("Reviewer name").fill("authorized-reviewer");
  await quarantine
    .getByLabel("Rationale")
    .fill("Synthetic exact-byte review completed.");
  const riskItem = page.locator(".quarantine-list > li", {
    hasText: "synthetic-risk.exe",
  });
  await riskItem
    .getByRole("button", { name: "Release for use" })
    .click();
  await expect(
    quarantine.getByText("Released", { exact: true }),
  ).toBeVisible();
  await picker.setInputFiles({
    name: "synthetic-risk-copy.exe",
    mimeType: "application/octet-stream",
    buffer: riskyBytes,
  });
  const inheritedItem = page.locator(".quarantine-list > li", {
    hasText: "synthetic-risk-copy.exe",
  });
  await inheritedItem
    .getByRole("button", { name: "Inherit approved status", exact: true })
    .click();
  await expect(
    inheritedItem.getByText("Released", { exact: true }),
  ).toBeVisible();

  await picker.setInputFiles({
    name: "synthetic-risk-changed.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x01]),
  });
  const changedItem = page.locator(".quarantine-list > li", {
    hasText: "synthetic-risk-changed.exe",
  });
  await expect(
    changedItem.getByRole("button", {
      name: "Inherit approved status",
      exact: true,
    }),
  ).toBeDisabled();
  await inheritedItem
    .getByRole("button", { name: "Withdraw approval", exact: true })
    .click();
  await expect(
    inheritedItem.getByText("Revoked", { exact: true }),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

import { expect, test } from "./fixtures";
import { installSyntheticWorkspace } from "./synthetic-workspace";

test("reviews classification and relationship proposals with immutable human history", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await installSyntheticWorkspace(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Select local workspace" }).click();
  await page.getByLabel("Reviewer identifier").fill("synthetic-reviewer");
  await page.getByLabel("Reviewer display name").fill("Synthetic Reviewer");
  await page
    .getByLabel("Authoritative PBGC case identifier")
    .fill("PBGC-SYNTHETIC-CLASSIFICATION");
  await page.getByRole("button", { name: "Create production case" }).click();
  await page.getByLabel("Select individual files").setInputFiles([
    {
      name: "synthetic-plan.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "Executed Defined Benefit Plan Document effective 2020-01-01.",
      ),
    },
    {
      name: "synthetic-plan-amendment.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "Executed defined benefit plan document effective 2020-01-01 with amendment.",
      ),
    },
  ]);
  await expect(page.getByText("Inventory checkpoint complete")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Classification review" }),
  ).toBeVisible();
  const classification = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Classification review" }),
  });
  await expect(
    classification.getByText("Human approval required"),
  ).toBeVisible();
  await expect(
    page.getByText("proposed", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("provisional", { exact: true }).first(),
  ).toBeVisible();
  await page.getByLabel("Classification reviewer").fill("authorized-reviewer");
  await page
    .getByLabel("Classification rationale")
    .fill("Synthetic document category reviewed.");
  const firstClassification = page
    .locator(".review-panel")
    .first()
    .locator("li")
    .first();
  await firstClassification.getByRole("button", { name: "approve" }).click();
  await expect(
    firstClassification.getByText("approved", { exact: true }),
  ).toBeVisible();
  await expect(
    firstClassification.getByText("proposed", { exact: true }),
  ).toBeVisible();
  await firstClassification.getByRole("button", { name: "revoke" }).click();
  await expect(
    firstClassification.getByText("revoked", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Effective-date candidates" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "select date candidate" })
    .first()
    .click();
  await expect(
    page.getByText("selected", { exact: true }).first(),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Relationship review" }),
  ).toBeVisible();
  await page.getByLabel("Relationship reviewer").fill("relationship-reviewer");
  await page
    .getByLabel("Relationship rationale")
    .fill("Synthetic similarity evidence reviewed.");
  const relationship = page
    .locator(".review-panel")
    .nth(1)
    .locator("li")
    .first();
  await relationship.getByRole("button", { name: "reject" }).click();
  await expect(
    relationship.getByText("rejected", { exact: true }),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

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
  await page.getByLabel("Case number").fill("PBGC-SYNTHETIC-CLASSIFICATION");
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
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Classification review" }),
  ).toBeVisible();
  await expect(page.getByText("Awaiting review").first()).toBeVisible();

  const classification = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Classification review" }),
  });
  await classification.getByLabel("Reviewer name").fill("authorized-reviewer");
  await classification
    .getByLabel("Rationale")
    .fill("Synthetic document category reviewed.");
  const firstClassification = classification.locator("li").first();
  await firstClassification.getByRole("button", { name: "Approve" }).click();
  await expect(
    firstClassification.getByText("Approved", { exact: true }),
  ).toBeVisible();
  await firstClassification
    .getByRole("button", { name: "Withdraw approval" })
    .click();
  await expect(
    firstClassification.getByText("Revoked", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Effective-date candidates" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "select date candidate" })
    .first()
    .click();
  await expect(
    page.getByText("Selected", { exact: true }).first(),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Relationship review" }),
  ).toBeVisible();
  const relationship = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Relationship review" }),
  });
  await relationship.getByLabel("Reviewer name").fill("relationship-reviewer");
  await relationship
    .getByLabel("Rationale")
    .fill("Synthetic similarity evidence reviewed.");
  const firstRelationship = relationship.locator("li").first();
  await firstRelationship.getByRole("button", { name: "Reject" }).click();
  await expect(
    firstRelationship.getByText("Rejected", { exact: true }),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

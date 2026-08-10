import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

test("builds and restores active-case catalog and proposal-only candidates", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-GOVERNED-EVIDENCE");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "governed-plan.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Executed defined benefit plan document. Effective January 1, 2025, benefit formula equals 1.5% of compensation.",
    ),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();

  const eligibility = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Artifact eligibility review" }),
  });
  await eligibility.getByLabel("Reviewer name").fill("Evidence Reviewer");
  await eligibility
    .getByLabel("Rationale")
    .fill("Exact preserved bytes and screening result reviewed.");
  await eligibility
    .getByRole("button", { name: "Approve governed use" })
    .click();

  const classification = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Classification review" }),
  });
  const sourceRole = classification.locator(".review-list > li").filter({
    hasText: "source-role",
  });
  await expect(sourceRole).toContainText("executed-plan-document");
  await sourceRole
    .getByRole("button", { name: "Approve", exact: true })
    .click();

  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await expect(page.getByText("Current governed catalog")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "governed-plan.txt", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Candidates", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Provision candidate review" }),
  ).toBeVisible();
  await expect(
    page.locator("blockquote").filter({
      hasText: /benefit formula equals 1\.5% of compensation/iu,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page
    .getByRole("button", { name: "Open PBGC-GOVERNED-EVIDENCE" })
    .click();
  await page.getByRole("button", { name: "Candidates", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Provision candidate review" }),
  ).toBeVisible();

  const restoredEligibility = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Artifact eligibility review" }),
  });
  await restoredEligibility
    .getByLabel("Reviewer name")
    .fill("Evidence Reviewer");
  await restoredEligibility
    .getByLabel("Rationale")
    .fill("Current governed use is no longer approved.");
  await restoredEligibility
    .getByRole("button", { name: "Revoke eligibility" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Provision candidate review" }),
  ).not.toBeVisible();
  await expect(
    page.getByText(/catalog is pending artifact eligibility/iu),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

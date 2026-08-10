import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

function eligibilityReview(page: import("@playwright/test").Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: "Artifact eligibility review" }),
  });
}

test("records and restores a separate exact-hash eligibility approval", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-ELIGIBILITY-CLEAN");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "clean-plan.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Executed defined benefit plan document"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();

  const review = eligibilityReview(page);
  const item = review.locator(".review-list > li", {
    hasText: "clean-plan.txt",
  });
  await expect(item.getByText("Not required", { exact: true })).toBeVisible();
  await expect(
    item.getByText("Awaiting review", { exact: true }),
  ).toBeVisible();
  await review.getByLabel("Reviewer name").fill("Eligibility Reviewer");
  await review
    .getByLabel("Rationale")
    .fill("Exact preserved bytes and screening results reviewed.");
  await item.getByRole("button", { name: "Approve governed use" }).click();
  await expect(item.getByText("Eligible", { exact: true })).toBeVisible();
  await expect(item.getByText("1 event(s)", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page
    .getByRole("button", { name: "Open PBGC-ELIGIBILITY-CLEAN" })
    .click();
  await expect(
    page.getByText("Evidence restored from this case's persisted manifest."),
  ).toBeVisible();
  await expect(item.getByText("Eligible", { exact: true })).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

test("requires an effective quarantine release before risky evidence eligibility", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-ELIGIBILITY-RISKY");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic-risk.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();

  const review = eligibilityReview(page);
  const eligibilityItem = review.locator(".review-list > li", {
    hasText: "synthetic-risk.exe",
  });
  const approve = eligibilityItem.getByRole("button", {
    name: "Approve governed use",
  });
  await review.getByLabel("Reviewer name").fill("Eligibility Reviewer");
  await review
    .getByLabel("Rationale")
    .fill("Exact preserved bytes and findings reviewed.");
  await expect(
    eligibilityItem.getByText("Release required", { exact: true }),
  ).toBeVisible();
  await expect(approve).toBeDisabled();

  const quarantine = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Quarantine queue" }),
  });
  await quarantine.getByRole("button", { name: "Release safety hold" }).click();
  await expect(
    eligibilityItem.getByText("Safety hold released", { exact: true }),
  ).toBeVisible();
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(
    eligibilityItem.getByText("Eligible", { exact: true }),
  ).toBeVisible();
  await expect(
    quarantine.getByText(/eligibility history cites/iu),
  ).toBeVisible();
  const withdrawRelease = quarantine.getByRole("button", {
    name: "Withdraw approval",
  });
  await expect(withdrawRelease).toBeEnabled();
  await withdrawRelease.click();
  await expect(
    eligibilityItem.getByText("blocked", { exact: true }),
  ).toBeVisible();
  await expect(
    eligibilityItem.getByText("Release required", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page
    .getByRole("button", { name: "Open PBGC-ELIGIBILITY-RISKY" })
    .click();
  await expect(
    page.getByText("Evidence restored from this case's persisted manifest."),
  ).toBeVisible();
  await expect(
    eligibilityItem.getByText("blocked", { exact: true }),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

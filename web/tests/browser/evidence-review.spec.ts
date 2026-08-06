import { expect, test } from "./fixtures";

test("reviews synthetic evidence through catalog, candidates, unresolved items, and rule authoring", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await page.goto("/");

  const reviewStage = page.locator(".evidence-review-stage");
  await expect(
    reviewStage.getByRole("heading", { name: "Evidence and plan-rule review" }),
  ).toBeVisible();
  await expect(
    reviewStage.getByText("Typed synthetic demo candidates"),
  ).toBeVisible();

  await reviewStage
    .getByLabel("Filter by source role")
    .selectOption("amendment");
  await expect(
    reviewStage.getByText("1 catalog artifact(s) match this filter"),
  ).toBeVisible();
  await expect(
    reviewStage.getByRole("heading", { name: "Quarantined exclusions" }),
  ).toBeVisible();

  await reviewStage.getByRole("button", { name: "Candidates" }).click();
  await expect(
    reviewStage.getByRole("heading", { name: "Provision candidate review" }),
  ).toBeVisible();
  await expect(
    reviewStage.getByText(/Near-duplicate relationship/u).first(),
  ).toBeVisible();
  await expect(
    reviewStage.getByText(/Proposed amendment link/u).first(),
  ).toBeVisible();

  await reviewStage.getByRole("button", { name: "Rule authoring" }).click();
  await expect(reviewStage.getByRole("alert")).toContainText(
    "BLOCKED_BY_UNRESOLVED_ITEM",
  );
  await expect(
    reviewStage.getByRole("button", { name: "Validate rule preview" }),
  ).toBeDisabled();

  await reviewStage.getByRole("button", { name: "Unresolved items" }).click();
  await reviewStage.getByLabel("Reviewer name").fill("Synthetic Reviewer");
  await reviewStage
    .getByLabel("Resolution rationale")
    .fill("Synthetic scope interpretation reviewed.");
  const unresolvedItem = reviewStage.getByRole("listitem");
  await expect(
    unresolvedItem.getByRole("button", { name: "Supersede" }),
  ).toBeVisible();
  await expect(
    unresolvedItem.getByRole("button", { name: "Reject" }),
  ).toBeVisible();
  await expect(
    unresolvedItem.getByRole("button", { name: "Branch" }),
  ).toBeVisible();
  await unresolvedItem.getByRole("button", { name: "Accept" }).click();
  await expect(unresolvedItem.getByText("Status: Resolved")).toBeVisible();

  await reviewStage.getByRole("button", { name: "Rule authoring" }).click();
  await expect(
    reviewStage.getByText(
      "No open unresolved item blocks this synthetic preview rule scope.",
    ),
  ).toBeVisible();
  await reviewStage
    .getByLabel("Condition value")
    .fill("all synthetic participants");
  await reviewStage
    .getByLabel("Authorized reviewer")
    .fill("Synthetic Reviewer");
  await reviewStage
    .getByLabel("Approval rationale")
    .fill("Synthetic evidence and scope reviewed.");
  await reviewStage
    .getByRole("button", { name: "Validate rule preview" })
    .click();
  await expect(
    reviewStage.getByText(/Governed validation passed/u),
  ).toContainText("Select a workspace and active case to persist rule records");
  await page.reload();
  await reviewStage.getByRole("button", { name: "Unresolved items" }).click();
  await expect(reviewStage.getByText("Status: Open")).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

test("keeps evidence review usable at a narrow viewport with keyboard controls", async ({
  offlinePage: page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const reviewStage = page.locator(".evidence-review-stage");
  await reviewStage.getByRole("button", { name: "Unresolved items" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    reviewStage.getByRole("heading", { name: "Unresolved item queue" }),
  ).toBeVisible();
  await expect(reviewStage.getByRole("button", { name: "Accept" })).toHaveCSS(
    "min-height",
    "44px",
  );
});

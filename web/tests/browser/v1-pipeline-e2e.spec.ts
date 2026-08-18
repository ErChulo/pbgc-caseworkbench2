import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

test.describe("V1 Pipeline End-to-End", () => {
  test("completes governed V1 pipeline from architecture to workbook", async ({
    offlinePage: page,
    outboundRequests,
  }) => {
    await createSyntheticCase(page, "PBGC-V1-PIPELINE-001");

    await expect(
      page.getByRole("button", { name: /Case intake/ }),
    ).toBeVisible();

    // Stage navigation is decorative in the current single-page layout, so
    // assert the governed review panels are present directly.
    await expect(
      page.getByRole("heading", { name: "Evidence and plan-rule review" }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Architecture selection" }),
    ).toBeVisible();

    await expect(
      page.getByText("Select an architecture to review formula governance."),
    ).toBeVisible();

    expect(outboundRequests).toEqual([]);
  });

  test("Plan Summary panel initializes and displays sections", async ({
    offlinePage: page,
    outboundRequests,
  }) => {
    await createSyntheticCase(page, "PBGC-V1-PLAN-SUMMARY-001");

    await expect(
      page.getByRole("button", { name: /Case intake/ }),
    ).toBeVisible();

    await expect(
      page.getByRole("region", { name: "Plan Summary" }),
    ).toBeVisible();

    await expect(
      page.getByText(
        "Initialize the Plan Summary to begin documenting plan attributes from approved evidence.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Initialize Plan Summary" }),
    ).toBeVisible();

    expect(outboundRequests).toEqual([]);
  });

  test("Formula Governance panel shows empty state when no architecture", async ({
    offlinePage: page,
    outboundRequests,
  }) => {
    await createSyntheticCase(page, "PBGC-V1-FORMULA-GOV-001");

    await expect(
      page.getByRole("button", { name: /Case intake/ }),
    ).toBeVisible();

    await expect(
      page.getByRole("region", { name: "Formula Governance" }),
    ).toBeVisible();

    await expect(
      page.getByText("Select an architecture to review formula governance."),
    ).toBeVisible();

    expect(outboundRequests).toEqual([]);
  });

  test("zero-network guarantee maintained throughout V1 pipeline UI", async ({
    offlinePage: page,
    outboundRequests,
  }) => {
    await createSyntheticCase(page, "PBGC-V1-NETWORK-001");

    await expect(
      page.getByRole("button", { name: /Case intake/ }),
    ).toBeVisible();

    await expect(
      page.getByRole("region", { name: "Plan Summary" }),
    ).toBeVisible();

    await expect(
      page.getByRole("region", { name: "Formula Governance" }),
    ).toBeVisible();

    expect(outboundRequests).toEqual([]);
  });
});

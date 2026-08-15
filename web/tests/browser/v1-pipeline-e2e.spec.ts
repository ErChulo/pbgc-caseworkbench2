import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

test.describe("V1 Pipeline End-to-End", () => {
  test("completes governed V1 pipeline from architecture to workbook", async ({
    offlinePage: page,
    outboundRequests,
  }) => {
    await createSyntheticCase(page, "PBGC-V1-PIPELINE-001");

    await expect(
      page.getByRole("heading", { name: "Case intake" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Evidence and rules" }).click();

    await expect(
      page.getByRole("heading", { name: "Evidence and plan-rule review" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Architecture" }).click();

    await expect(
      page.getByRole("heading", { name: "Architecture" }),
    ).toBeVisible();

    await expect(
      page.getByText("Select an architecture to review formula governance."),
    ).toBeVisible();

    await expect(
      page.getByText(
        "Complete architecture selection before reviewing formula governance.",
      ),
    ).toBeVisible();

    expect(outboundRequests).toEqual([]);
  });

  test("Plan Summary panel initializes and displays sections", async ({
    offlinePage: page,
    outboundRequests,
  }) => {
    await createSyntheticCase(page, "PBGC-V1-PLAN-SUMMARY-001");

    await expect(
      page.getByRole("heading", { name: "Case intake" }),
    ).toBeVisible();

    await expect(
      page.getByRole("region", { name: "Plan Summary" }),
    ).toBeVisible();

    await expect(
      page.getByText(
        "Complete evidence intake and classification before starting the Plan Summary.",
      ),
    ).toBeVisible();

    expect(outboundRequests).toEqual([]);
  });

  test("Formula Governance panel shows empty state when no architecture", async ({
    offlinePage: page,
    outboundRequests,
  }) => {
    await createSyntheticCase(page, "PBGC-V1-FORMULA-GOV-001");

    await expect(
      page.getByRole("heading", { name: "Case intake" }),
    ).toBeVisible();

    await expect(
      page.getByRole("region", { name: "Formula Governance" }),
    ).toBeVisible();

    await expect(
      page.getByText(
        "Complete architecture selection before reviewing formula governance.",
      ),
    ).toBeVisible();

    expect(outboundRequests).toEqual([]);
  });

  test("zero-network guarantee maintained throughout V1 pipeline UI", async ({
    offlinePage: page,
    outboundRequests,
  }) => {
    await createSyntheticCase(page, "PBGC-V1-NETWORK-001");

    await expect(
      page.getByRole("heading", { name: "Case intake" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Evidence and rules" }).click();
    await page.getByRole("button", { name: "Architecture" }).click();

    await expect(
      page.getByRole("region", { name: "Plan Summary" }),
    ).toBeVisible();

    await expect(
      page.getByRole("region", { name: "Formula Governance" }),
    ).toBeVisible();

    expect(outboundRequests).toEqual([]);
  });
});

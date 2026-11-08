import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

test.describe("V1 Pipeline End-to-End", () => {
  test("shows the governed V1 pipeline panels before architecture is built", async ({
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

    const initialize = page.getByRole("button", {
      name: "Initialize Plan Summary",
    });
    await expect(initialize).toBeDisabled();
    await page.getByLabel("Add evidence files").setInputFiles({
      name: "synthetic.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic evidence."),
    });
    await expect(page.getByText("File inventory complete")).toBeVisible();
    await expect(initialize).toBeEnabled();
    await initialize.click();
    const summary = page.getByRole("region", { name: "Plan Summary" });
    await expect(summary.getByLabel("Plan Summary reviewer")).toBeVisible();
    await expect(
      summary.getByText(
        /Reviewer identity and authority are not authenticated/u,
      ),
    ).toBeVisible();
    await expect(
      summary.getByRole("navigation", { name: "Plan Summary sections" }),
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

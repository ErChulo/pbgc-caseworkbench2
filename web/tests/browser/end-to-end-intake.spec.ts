import { expect, test } from "./fixtures";
import { installSyntheticWorkspace } from "./synthetic-workspace";
import { archiveFixtures } from "../fixtures/generators/archives";

async function createCase(
  page: import("@playwright/test").Page,
  caseId: string,
) {
  await installSyntheticWorkspace(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Select local workspace" }).click();
  await page.getByLabel("Reviewer identifier").fill("synthetic-reviewer");
  await page.getByLabel("Reviewer display name").fill("Synthetic Reviewer");
  await page.getByLabel("Case number").fill(caseId);
  await page.getByRole("button", { name: "Create production case" }).click();
}

test("handles nested archives, interruption, and unchanged resumption", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createCase(page, "PBGC-T118-ARCHIVE");
  await expect(page.getByLabel("Select individual files")).toBeEnabled();

  const archive = archiveFixtures().nested;
  await page.getByLabel("Select individual files").setInputFiles([
    {
      name: "nested.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(archive),
    },
    {
      name: "large-synthetic.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.alloc(24 * 1024 * 1024, 17),
    },
  ]);
  await expect(
    page.getByRole("button", { name: "Stop safely" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop safely" }).click();
  await expect(page.getByText("File inventory interrupted")).toBeVisible();
  await expect(
    page.getByText("Work stopped at a durable boundary.").first(),
  ).toBeVisible();

  await page.getByLabel("Select individual files").setInputFiles([
    {
      name: "nested.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(archive),
    },
  ]);
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await expect(
    page.getByText("First snapshot of this file set created."),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

test("completes quarantine, classification, population, and manifest export", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createCase(page, "PBGC-T118-INTAKE");
  await page.getByLabel("Select individual files").setInputFiles([
    {
      name: "synthetic-risk.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
    },
    {
      name: "synthetic-plan.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "Executed Defined Benefit Plan Document. Effective 2020-01-01.",
      ),
    },
    {
      name: "synthetic-population.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          "generalKey,status,service,leadingZero",
          "SYN-001,active,0,0012",
          "SYN-002,,INVALID",
        ].join("\n"),
      ),
    },
  ]);

  const quarantine = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Quarantine queue" }) });
  const classification = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Classification review" }),
    });
  const population = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Population candidate review" }),
    });

  await expect(
    page.getByRole("heading", { name: "Quarantine queue" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Classification review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Population candidate review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Evidence manifest" }),
  ).toBeVisible();

  await quarantine.getByLabel("Reviewer name").fill("authorized-reviewer");
  await quarantine
    .getByLabel("Rationale")
    .fill("Synthetic exact-byte review completed.");
  const riskItem = quarantine.locator("li", {
    hasText: "synthetic-risk.exe",
  });
  // The QuarantineQueue renders a keyboard-shortcut hint inside the Release
  // button ("⌘↵"), so its accessible name is "Release for use⌘↵". Use a
  // substring match rather than `exact` to keep the test green.
  const releaseButton = riskItem.getByRole("button", {
    name: "Release for use",
  });
  await expect(releaseButton).toBeEnabled();
  await releaseButton.click();
  await expect(
    riskItem.getByText("Released", { exact: true }),
  ).toBeVisible();

  await classification.getByLabel("Reviewer name").fill("authorized-reviewer");
  await classification
    .getByLabel("Rationale")
    .fill("Synthetic classification reviewed.");
  const firstClassification = classification.locator("li").first();
  const approveClassification = firstClassification.getByRole("button", {
    name: "Approve",
  });
  await expect(approveClassification).toBeEnabled();
  await approveClassification.click();
  await expect(
    firstClassification.getByText("Approved", { exact: true }),
  ).toBeVisible();

  await population.getByLabel("Reviewer name").fill("authorized-reviewer");
  await population
    .getByLabel("Rationale")
    .fill("Synthetic population evidence reviewed.");
  const firstPopulation = population.locator("li").first();
  const approvePopulation = firstPopulation.getByRole("button", {
    name: "Approve",
  });
  await expect(approvePopulation).toBeEnabled();
  await approvePopulation.click();
  await expect(
    firstPopulation.getByText("Approved", { exact: true }),
  ).toBeVisible();

  const exportButton = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Evidence manifest" }) })
    .getByRole("button", { name: "Export local manifest" });
  await expect(exportButton).toBeEnabled();
  await exportButton.click();
  expect(outboundRequests).toEqual([]);
});

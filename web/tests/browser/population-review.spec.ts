import { expect, test } from "./fixtures";
import { installSyntheticWorkspace } from "./synthetic-workspace";

test("profiles a synthetic population locally and records a separate human decision", async ({
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
    .fill("PBGC-SYNTHETIC-POPULATION");
  await page.getByRole("button", { name: "Create production case" }).click();
  await page.getByLabel("Select individual files").setInputFiles({
    name: "synthetic-population.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "generalKey,status,service,leadingZero",
        "SYN-001,active,0,0012",
        "SYN-002,,INVALID",
      ].join("\n"),
    ),
  });
  await expect(page.getByText("Inventory checkpoint complete")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Population candidate review" }),
  ).toBeVisible();
  const population = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Population candidate review" }),
  });
  await expect(
    population.getByText("unresolved", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    population.getByText(/generalKey, status, service/u),
  ).toBeVisible();
  await expect(
    population.getByText("provisional", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Population reviewer").fill("population-reviewer");
  await page
    .getByLabel("Population rationale")
    .fill("Synthetic structural candidate reviewed locally.");
  await population.getByRole("button", { name: "approve" }).click();
  await expect(population.getByText("approved", { exact: true })).toBeVisible();
  await expect(
    population.getByText("unresolved", { exact: true }),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

import { expect, test } from "./fixtures";
import { installSyntheticWorkspace } from "./synthetic-workspace";

test("shows a deterministic manifest, unresolved status, and one-view lineage locally", async ({
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
    .fill("PBGC-SYNTHETIC-MANIFEST");
  await page.getByRole("button", { name: "Create production case" }).click();
  await page.getByLabel("Select individual files").setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("generalKey,value\nSYN-1,0\nSYN-2,\n"),
  });
  await expect(
    page.getByRole("heading", { name: "Evidence manifest" }),
  ).toBeVisible();
  const manifest = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Evidence manifest" }),
  });
  await expect(manifest.getByText("One-view lineage")).toBeVisible();
  await expect(manifest.getByText(/Accounting classification:/u)).toBeVisible();
  await expect(manifest.getByText(/Provisional block:/u)).toBeVisible();
  await expect(manifest.getByText(/^[0-9a-f]{64}$/u).first()).toBeVisible();
  await manifest.getByRole("button", { name: "Export local manifest" }).click();
  expect(outboundRequests).toEqual([]);
});

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
  await page.getByRole("button", { name: "Establish identity" }).click();
  await page.getByLabel("Case number").fill("PBGC-SYNTHETIC-MANIFEST");
  await page.getByRole("button", { name: "Create production case" }).click();
  await page.getByLabel("Add evidence files").setInputFiles({
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
  await expect(manifest.getByText("File-to-decision trace")).toBeVisible();
  await expect(manifest.getByText(/Processing status:/u)).toBeVisible();
  await expect(manifest.getByText(/Safety review needed:/u)).toBeVisible();
  await expect(manifest.getByText(/^[0-9a-f]{64}$/u).first()).toBeVisible();
  await manifest.getByRole("button", { name: "Export local manifest" }).click();
  expect(outboundRequests).toEqual([]);
});

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { docxFixture } from "../fixtures/generators/passive-formats";
import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

test("extracts synthetic DOCX evidence from the built offline file", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  const httpRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) httpRequests.push(request.url());
  });
  await page.route(/^https?:/u, (route) => route.abort());
  const artifact = pathToFileURL(
    resolve(process.env.PBGC_TEST_ARTIFACT ?? "dist/pbgc-caseworkbench.html"),
  ).href;
  await createSyntheticCase(
    page,
    "PBGC-OOXML-FILE-001",
    "synthetic-reviewer",
    "Synthetic Reviewer",
    artifact,
  );
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic-plan.docx",
    // Generic MIME avoids the separate ZIP-vs-OOXML signature mismatch hold.
    mimeType: "application/octet-stream",
    buffer: Buffer.from(docxFixture()),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const row = page
    .getByRole("table", { name: "Provisional artifact inventory" })
    .getByRole("row", { name: /synthetic-plan.docx/u });
  await row.getByRole("button", { name: /Open evidence/u }).click();
  await expect(
    page.locator(".evidence-viewer-pane").nth(1).locator("pre"),
  ).toContainText("Synthetic plan text");
  expect(outboundRequests).toEqual([]);
  expect(httpRequests).toEqual([]);
});

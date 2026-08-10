import path from "node:path";

import { expect, test } from "./fixtures";
import { installSyntheticWorkspace } from "./synthetic-workspace";

async function createSyntheticCase(page: import("@playwright/test").Page) {
  await installSyntheticWorkspace(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Select local workspace" }).click();
  await page.getByLabel("Reviewer identifier").fill("synthetic-reviewer");
  await page.getByLabel("Reviewer display name").fill("Synthetic Reviewer");
  await page.getByRole("button", { name: "Establish identity" }).click();
  await page.getByLabel("Case number").fill("PBGC-SYNTHETIC-INTAKE");
  await page.getByRole("button", { name: "Create production case" }).click();
}

test("inventories, hashes, preserves, and resumes an unchanged synthetic selection locally", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page);
  const picker = page.getByLabel("Import evidence folder");
  const fixtureDirectory = path.resolve("web/tests/fixtures/browser-package");
  await picker.setInputFiles(fixtureDirectory);
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await expect(
    page.getByText(
      "Same content as another file. Kept separately; no approval given.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("First snapshot of this file set created."),
  ).toBeVisible();
  const rediscover = async (file: string) => ({
    name: `browser-package/${file}`,
    mimeType: "text/plain",
    buffer: await (
      await import("node:fs/promises")
    ).readFile(path.join(fixtureDirectory, file)),
  });
  const filePicker = page.getByLabel("Add evidence files");
  const alpha = await rediscover("alpha.txt");
  const beta = await rediscover("beta.txt");
  await filePicker.setInputFiles([alpha, beta]);
  await expect(
    page.getByText(
      "Same active evidence as before — additional intake provenance preserved.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Pending review")).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

test("records changed selection as linked divergence and preserves partial continuation", async ({
  page,
}) => {
  await createSyntheticCase(page);
  const picker = page.getByLabel("Add evidence files");
  await picker.setInputFiles({
    name: "alpha.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("one"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await picker.setInputFiles({
    name: "alpha.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("two"),
  });
  await expect(
    page.getByText("Files changed — new snapshot linked to the previous one."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "File preserved. Downstream use blocked until all reviews complete.",
    ),
  ).toHaveCount(2);
  await expect(
    page
      .getByRole("table", { name: "Provisional artifact inventory" })
      .getByText("alpha.txt", { exact: true }),
  ).toHaveCount(2);
});

test("interrupts large-file hashing at a safe boundary without claiming completion", async ({
  page,
}) => {
  await createSyntheticCase(page);
  const picker = page.getByLabel("Add evidence files");
  const selection = picker.setInputFiles({
    name: "large-synthetic.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(24 * 1024 * 1024, 17),
  });
  await selection;
  await expect(page.getByRole("button", { name: "Stop safely" })).toBeVisible();
  await page.getByRole("button", { name: "Stop safely" }).click();
  await expect(page.getByText("File inventory interrupted")).toBeVisible();
  await expect(
    page.getByText("Work stopped at a durable boundary."),
  ).toBeVisible();
});

import path from "node:path";

import { expect, test } from "./fixtures";
import { installSyntheticWorkspace } from "./synthetic-workspace";

async function createSyntheticCase(page: import("@playwright/test").Page) {
  await installSyntheticWorkspace(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Select local workspace" }).click();
  await page.getByLabel("Reviewer identifier").fill("synthetic-reviewer");
  await page.getByLabel("Reviewer display name").fill("Synthetic Reviewer");
  await page
    .getByLabel("Authoritative PBGC case identifier")
    .fill("PBGC-SYNTHETIC-INTAKE");
  await page.getByRole("button", { name: "Create production case" }).click();
}

test("inventories, hashes, preserves, and resumes an unchanged synthetic selection locally", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page);
  const picker = page.getByLabel("Select a folder");
  const fixtureDirectory = path.resolve("web/tests/fixtures/browser-package");
  await picker.setInputFiles(fixtureDirectory);
  await expect(page.getByText("Inventory checkpoint complete")).toBeVisible();
  await expect(
    page.getByText(
      "Exact bytes linked to a separate receipt; no approval conferred.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Initial immutable snapshot created."),
  ).toBeVisible();
  await picker.setInputFiles(fixtureDirectory);
  await expect(
    page.getByText("Unchanged snapshot resumed without duplicate records."),
  ).toBeVisible();
  await expect(page.getByText("Provisional only")).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

test("records changed selection as linked divergence and preserves partial continuation", async ({
  page,
}) => {
  await createSyntheticCase(page);
  const picker = page.getByLabel("Select individual files");
  await picker.setInputFiles({
    name: "alpha.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("one"),
  });
  await expect(page.getByText("Inventory checkpoint complete")).toBeVisible();
  await picker.setInputFiles({
    name: "alpha.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("two"),
  });
  await expect(
    page.getByText("Changed package created a linked snapshot."),
  ).toBeVisible();
  await expect(
    page.getByText(/downstream use remains blocked/iu),
  ).toBeVisible();
});

test("interrupts large-file hashing at a safe boundary without claiming completion", async ({
  page,
}) => {
  await createSyntheticCase(page);
  const picker = page.getByLabel("Select individual files");
  const selection = picker.setInputFiles({
    name: "large-synthetic.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(24 * 1024 * 1024, 17),
  });
  await selection;
  await expect(
    page.getByRole("button", { name: "Interrupt safely" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Interrupt safely" }).click();
  await expect(page.getByText("Inventory interrupted")).toBeVisible();
  await expect(
    page.getByText("Work stopped at a durable boundary."),
  ).toBeVisible();
});

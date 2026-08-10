import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

const intakePanel = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Add files to the case" });

test("restores persisted evidence inventory when reopening an existing case", async ({
  page,
}) => {
  await createSyntheticCase(page, "PBGC-RESTORE-001");
  const picker = page.getByLabel("Add evidence files");
  await picker.setInputFiles({
    name: "alpha.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("alpha-alpha"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await expect(
    page.getByText("First snapshot of this file set created."),
  ).toBeVisible();
  const snapshotLabel = await page
    .locator(".package-summary code")
    .textContent();
  expect(snapshotLabel).toMatch(/^Snapshot [0-9a-f]{64}$/);
  const caseId = await page.getByTestId("current-case-id").innerText();
  const pointer = await page.evaluate((internalCaseId) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const bytes = files.get(`cases/${internalCaseId}/manifests/current.json`);
    if (bytes === undefined) throw new Error("Pointer fixture is missing.");
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  }, caseId);
  expect(Object.keys(pointer as Record<string, unknown>).sort()).toEqual([
    "checkpointSnapshotId",
    "writtenAt",
  ]);
  await expect(
    intakePanel(page).getByText("alpha.txt", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await expect(
    intakePanel(page).getByText("No artifacts selected."),
  ).toBeVisible({ timeout: 2_000 });

  await page.getByRole("button", { name: "Open PBGC-RESTORE-001" }).click();
  await expect(
    page.getByText("Evidence restored from this case's persisted manifest."),
  ).toBeVisible();
  await expect(page.getByText(snapshotLabel ?? "")).toBeVisible();
  await expect(
    intakePanel(page).getByText("alpha.txt", { exact: true }),
  ).toBeVisible();
  await expect(
    intakePanel(page).getByText("No artifacts selected."),
  ).toHaveCount(0);
});

test("a corrupt persisted pointer fails closed without restoring rows", async ({
  page,
}) => {
  await createSyntheticCase(page, "PBGC-RESTORE-004");
  const picker = page.getByLabel("Add evidence files");
  await picker.setInputFiles({
    name: "corrupt.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("corrupt-probe"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const caseId = await page.getByTestId("current-case-id").innerText();
  await page.evaluate((internalCaseId) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    files.set(
      `cases/${internalCaseId}/manifests/current.json`,
      new TextEncoder().encode("{ this is not valid pointer json"),
    );
  }, caseId);
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByRole("button", { name: "Open PBGC-RESTORE-004" }).click();
  await expect(
    page.getByText(
      "Evidence restoration is unavailable because the persisted inventory pointer could not be accepted. No files were changed.",
    ),
  ).toBeVisible();
  await expect(
    intakePanel(page).getByText("No artifacts selected."),
  ).toBeVisible();
});

test("a pointer to a missing immutable manifest fails closed without restoring rows", async ({
  page,
}) => {
  await createSyntheticCase(page, "PBGC-RESTORE-005");
  const picker = page.getByLabel("Add evidence files");
  await picker.setInputFiles({
    name: "missing-target.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("missing-target-probe"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const caseId = await page.getByTestId("current-case-id").innerText();
  await page.evaluate((internalCaseId) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const manifestPrefix = `cases/${internalCaseId}/manifests/`;
    for (const key of [...files.keys()]) {
      if (
        key.startsWith(manifestPrefix) &&
        key.endsWith(".json") &&
        !key.endsWith("current.json")
      ) {
        files.delete(key);
      }
    }
  }, caseId);
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByRole("button", { name: "Open PBGC-RESTORE-005" }).click();
  await expect(
    page.getByText(
      "Evidence restoration is unavailable because the referenced checkpoint manifest does not exist. No files were changed.",
    ),
  ).toBeVisible();
  await expect(
    intakePanel(page).getByText("No artifacts selected."),
  ).toBeVisible();
});

test("a structurally tampered immutable checkpoint fails closed", async ({
  page,
}) => {
  await createSyntheticCase(page, "PBGC-RESTORE-006");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "tamper.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("tamper-probe"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const caseId = await page.getByTestId("current-case-id").innerText();
  await page.evaluate((internalCaseId) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const pointerBytes = files.get(
      `cases/${internalCaseId}/manifests/current.json`,
    );
    if (pointerBytes === undefined)
      throw new Error("Pointer fixture is missing.");
    const pointer = JSON.parse(new TextDecoder().decode(pointerBytes)) as {
      checkpointSnapshotId: string;
    };
    const manifestPath = `cases/${internalCaseId}/manifests/${pointer.checkpointSnapshotId}.json`;
    const manifestBytes = files.get(manifestPath);
    if (manifestBytes === undefined)
      throw new Error("Manifest fixture is missing.");
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
      snapshot: { totalBytes: number };
    };
    manifest.snapshot.totalBytes += 1;
    files.set(
      manifestPath,
      new TextEncoder().encode(`${JSON.stringify(manifest)}\n`),
    );
  }, caseId);
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByRole("button", { name: "Open PBGC-RESTORE-006" }).click();
  await expect(
    page.getByText(
      "Evidence restoration is unavailable because the referenced checkpoint manifest is not valid. No files were changed.",
    ),
  ).toBeVisible();
  await expect(
    intakePanel(page).getByText("No artifacts selected."),
  ).toBeVisible();
});

test("a missing preserved content object fails closed", async ({ page }) => {
  await createSyntheticCase(page, "PBGC-RESTORE-007");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "missing-object.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("missing-object-probe"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const sha256 = await intakePanel(page).locator("tbody code").innerText();
  await page.evaluate((hash) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    files.delete(`objects/sha256/${hash.slice(0, 2)}/${hash}`);
  }, sha256);
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByRole("button", { name: "Open PBGC-RESTORE-007" }).click();
  await expect(
    page.getByText(
      "Evidence restoration is unavailable because preserved evidence could not be verified. No files were changed.",
    ),
  ).toBeVisible();
  await expect(
    intakePanel(page).getByText("No artifacts selected."),
  ).toBeVisible();
});

test("restored expectations let an identical re-import resume without duplicates", async ({
  page,
}) => {
  await createSyntheticCase(page, "PBGC-RESTORE-002");
  const caseId = await page.getByTestId("current-case-id").innerText();
  const picker = page.getByLabel("Add evidence files");
  await picker.setInputFiles({
    name: "beta.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("beta-beta"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();

  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByRole("button", { name: "Open PBGC-RESTORE-002" }).click();
  await expect(
    page.getByText("Evidence restored from this case's persisted manifest."),
  ).toBeVisible();

  await picker.setInputFiles({
    name: "beta.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("beta-beta"),
  });
  await expect(
    page.getByText(
      "Same active evidence as before — additional intake provenance preserved.",
    ),
  ).toBeVisible();
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const intakeEvents = await page.evaluate((internalCaseId) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const bytes = files.get(`cases/${internalCaseId}/intake/events.jsonl`);
    if (bytes === undefined)
      throw new Error("Intake event fixture is missing.");
    return new TextDecoder()
      .decode(bytes)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { resultingSnapshotId: string });
  }, caseId);
  expect(intakeEvents).toHaveLength(2);
  expect(
    new Set(intakeEvents.map((event) => event.resultingSnapshotId)).size,
  ).toBe(1);
});

test("importing additional evidence after restoration links a new snapshot to the restored one", async ({
  page,
}) => {
  await createSyntheticCase(page, "PBGC-RESTORE-003");
  const picker = page.getByLabel("Add evidence files");
  await picker.setInputFiles({
    name: "gamma.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("gamma-gamma"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();

  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByRole("button", { name: "Open PBGC-RESTORE-003" }).click();
  await expect(
    page.getByText("Evidence restored from this case's persisted manifest."),
  ).toBeVisible();

  await picker.setInputFiles({
    name: "delta.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("delta-delta"),
  });
  await expect(
    page.getByText("Files changed — new snapshot linked to the previous one."),
  ).toBeVisible();
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await expect(
    intakePanel(page).getByText("gamma.txt", { exact: true }),
  ).toBeVisible();
  await expect(
    intakePanel(page).getByText("delta.txt", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByRole("button", { name: "Open PBGC-RESTORE-003" }).click();
  await expect(
    page.getByText("Evidence restored from this case's persisted manifest."),
  ).toBeVisible();
  await expect(
    intakePanel(page).getByText("gamma.txt", { exact: true }),
  ).toBeVisible();
  await expect(
    intakePanel(page).getByText("delta.txt", { exact: true }),
  ).toBeVisible();
});

test("opening another case clears all prior case evidence projections", async ({
  page,
}) => {
  await createSyntheticCase(page, "PBGC-ISOLATION-A");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "case-a-plan.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Plan document effective January 1, 2020"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await expect(
    page.getByText("case-a-plan.txt", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByLabel("Case number").fill("PBGC-ISOLATION-B");
  await page.getByRole("button", { name: "Create production case" }).click();

  await expect(page.getByTestId("active-case-authoritative-id")).toHaveText(
    "PBGC-ISOLATION-B",
  );
  await expect(
    intakePanel(page).getByText("No artifacts selected."),
  ).toBeVisible();
  await expect(page.getByText("case-a-plan.txt", { exact: true })).toHaveCount(
    0,
  );
});

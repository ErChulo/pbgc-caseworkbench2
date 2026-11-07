import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

async function gateRead(page: Page, target: string) {
  await page.evaluate((path) => {
    const state = globalThis as unknown as {
      __syntheticReadGate?: (path: string) => Promise<void>;
      __readGateHit?: boolean;
      __resolveReadGate?: () => void;
    };
    state.__readGateHit = false;
    state.__syntheticReadGate = async (current) => {
      if (current !== path) return;
      state.__readGateHit = true;
      await new Promise<void>((resolve) => {
        state.__resolveReadGate = resolve;
      });
      delete state.__syntheticReadGate;
    };
  }, target);
}
async function gateWrite(page: Page, target: string) {
  await page.evaluate((path) => {
    const state = globalThis as unknown as {
      __syntheticWriteGate?: (path: string) => Promise<void>;
      __readGateHit?: boolean;
      __resolveReadGate?: () => void;
    };
    state.__readGateHit = false;
    state.__syntheticWriteGate = async (current) => {
      if (current !== path) return;
      state.__readGateHit = true;
      await new Promise<void>((resolve) => {
        state.__resolveReadGate = resolve;
      });
      delete state.__syntheticWriteGate;
    };
  }, target);
}
async function waitForGate(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __readGateHit?: boolean }).__readGateHit,
      ),
    )
    .toBe(true);
}
async function releaseGate(page: Page) {
  await page.evaluate(() =>
    (
      globalThis as unknown as { __resolveReadGate?: () => void }
    ).__resolveReadGate?.(),
  );
}

test("does not save a stale link or export when case inputs change during local reads", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-OUTPUT-RACE-001");
  const id = (await page.getByTestId("current-case-id").textContent()) ?? "";
  const path = `cases/${id}/synthetic-output.json`;
  await page.evaluate((target) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    files.set(target, new TextEncoder().encode('{"synthetic":true}'));
  }, path);
  const output = page.locator("section.case-panel").filter({
    has: page.getByRole("heading", { name: "Case output package" }),
  });
  const link = output.getByRole("button", {
    name: "Hash and link workspace artifact",
  });
  const exportButton = output.getByRole("button", {
    name: "Export final output package",
  });
  await expect(link).toBeEnabled();
  await page.getByRole("button", { name: "Initialize Plan Summary" }).click();
  const reviewer = page.getByLabel("Plan Summary reviewer");
  await output.getByLabel("Artifact ID").fill("synthetic");
  await output.getByLabel("Workspace path").fill(path);
  await output.getByLabel("Description").fill("Synthetic output");
  await gateRead(page, path);
  await link.click();
  await waitForGate(page);
  await expect(link).toBeDisabled();
  await expect(exportButton).toBeDisabled();
  await reviewer.fill("changed reviewer");
  await releaseGate(page);
  await expect(
    output.getByText(/Case output inputs changed. Link the artifact again/),
  ).toBeVisible();
  const references = `cases/${id}/outputs/artifact-references.json`;
  expect(
    await page.evaluate(
      (target) =>
        (
          globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
        ).__syntheticFiles.has(target),
      references,
    ),
  ).toBe(false);
  await link.click();
  await expect(output.getByText(/Linked v1-architecture/)).toBeVisible();
  await gateRead(page, path);
  await exportButton.click();
  await waitForGate(page);
  await expect(exportButton).toBeDisabled();
  await reviewer.fill("another reviewer");
  await releaseGate(page);
  await expect(
    output.getByText(
      /Case output inputs changed. Check the case and export again/,
    ),
  ).toBeVisible();
  const exportPath = `cases/${id}/exports/final-casework-output-package.json`;
  expect(
    await page.evaluate(
      (target) =>
        (
          globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
        ).__syntheticFiles.has(target),
      exportPath,
    ),
  ).toBe(false);
  await exportButton.click();
  await expect(
    output.getByText(/Final output package exported with status blocked/),
  ).toBeVisible();
  await reviewer.fill("new reviewer");
  await expect(
    output.getByText(/Final output package exported with status blocked/),
  ).not.toBeVisible();
  await gateWrite(page, exportPath);
  await exportButton.click();
  await waitForGate(page);
  await reviewer.fill("changed during write");
  await releaseGate(page);
  await expect(
    output.getByText(
      /package may have been saved; inspect it and export again/,
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (target) =>
        (
          globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
        ).__syntheticFiles.has(target),
      exportPath,
    ),
  ).toBe(true);
  expect(outboundRequests).toEqual([]);
});

test("waits for reference restoration and blocks unsafe reference records without overwriting them", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-OUTPUT-RESTORE-001");
  const id = (await page.getByTestId("current-case-id").textContent()) ?? "";
  const path = `cases/${id}/synthetic-output.json`;
  const referencePath = `cases/${id}/outputs/artifact-references.json`;
  await page.evaluate(
    (target) =>
      (
        globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
      ).__syntheticFiles.set(target, new TextEncoder().encode("{}")),
    path,
  );
  let output = page.locator("section.case-panel").filter({
    has: page.getByRole("heading", { name: "Case output package" }),
  });
  await expect(
    output.getByRole("button", { name: "Hash and link workspace artifact" }),
  ).toBeEnabled();
  await output.getByLabel("Artifact ID").fill("synthetic");
  await output.getByLabel("Workspace path").fill(path);
  await output.getByLabel("Description").fill("Synthetic output");
  await output
    .getByRole("button", { name: "Hash and link workspace artifact" })
    .click();
  await expect(output.getByText(/Linked v1-architecture/)).toBeVisible();
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  const corrupt = '[{"invalid":true}]';
  await page.evaluate(
    ({ target, content }) =>
      (
        globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
      ).__syntheticFiles.set(target, new TextEncoder().encode(content)),
    { target: referencePath, content: corrupt },
  );
  await gateRead(page, referencePath);
  await page
    .getByRole("button", { name: "Open PBGC-OUTPUT-RESTORE-001" })
    .click();
  await waitForGate(page);
  output = page.locator("section.case-panel").filter({
    has: page.getByRole("heading", { name: "Case output package" }),
  });
  await expect(
    output.getByRole("button", { name: "Hash and link workspace artifact" }),
  ).toBeDisabled();
  await expect(
    output.getByRole("button", { name: "Export final output package" }),
  ).toBeDisabled();
  await releaseGate(page);
  await expect(
    output.getByText(/references could not be restored safely/),
  ).toBeVisible();
  await expect(
    output.getByRole("button", { name: "Hash and link workspace artifact" }),
  ).toBeDisabled();
  await expect(
    output.getByRole("button", { name: "Export final output package" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      (target) =>
        new TextDecoder().decode(
          (
            globalThis as unknown as {
              __syntheticFiles: Map<string, Uint8Array>;
            }
          ).__syntheticFiles.get(target),
        ),
      referencePath,
    ),
  ).toBe(corrupt);
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.evaluate(
    (target) =>
      (
        globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
      ).__syntheticFiles.set(target, new TextEncoder().encode("[]")),
    referencePath,
  );
  await page
    .getByRole("button", { name: "Open PBGC-OUTPUT-RESTORE-001" })
    .click();
  await expect(
    output.getByRole("button", { name: "Export final output package" }),
  ).toBeEnabled();
  await expect(
    output.getByText(/references could not be restored safely/),
  ).not.toBeVisible();
  expect(outboundRequests).toEqual([]);
});

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

test("waits for evidence restoration before allowing intake or switching cases", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-RESTORE-LOCK");
  const id = await page.getByTestId("current-case-id").textContent();
  if (!id) throw new Error("Synthetic case ID missing");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const home = page.getByRole("button", { name: "Return to workspace home" });
  await expect(home).toBeEnabled();
  await home.click();
  await page.evaluate((caseId) => {
    const g = globalThis as unknown as {
      __syntheticReadGate?: (path: string) => Promise<void>;
      __restoreEntered?: boolean;
      __releaseRestore?: () => void;
    };
    g.__syntheticReadGate = async (path) => {
      if (path === `cases/${caseId}/manifests/current.json`) {
        g.__restoreEntered = true;
        await new Promise<void>((done) => {
          g.__releaseRestore = done;
        });
        g.__syntheticReadGate = undefined;
      }
    };
  }, id);
  await page.getByRole("button", { name: "Open PBGC-RESTORE-LOCK" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __restoreEntered?: boolean })
            .__restoreEntered,
      ),
    )
    .toBe(true);
  await expect(home).toBeDisabled();
  await expect(
    page.getByText(
      /Restoring case evidence and reviews. Wait before switching cases or making changes/,
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Add evidence files")).toBeHidden();
  await page.evaluate(() =>
    (
      globalThis as unknown as { __releaseRestore?: () => void }
    ).__releaseRestore?.(),
  );
  await expect(home).toBeEnabled();
  await expect(page.getByLabel("Add evidence files")).toBeEnabled();
  await expect(
    page
      .getByLabel("Add files to the case")
      .getByText("synthetic.txt", { exact: true }),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

test("blocks intake when the existing evidence pointer cannot be verified", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-RESTORE-INVALID");
  const id = await page.getByTestId("current-case-id").textContent();
  if (!id) throw new Error("Synthetic case ID missing");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const home = page.getByRole("button", { name: "Return to workspace home" });
  await expect(home).toBeEnabled();
  await home.click();
  await page.evaluate((caseId) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    files.set(
      `cases/${caseId}/manifests/current.json`,
      new TextEncoder().encode('{"bad":"pointer"}'),
    );
  }, id);
  await page.getByRole("button", { name: "Open PBGC-RESTORE-INVALID" }).click();
  await expect(page.getByLabel("Add evidence files")).toBeDisabled();
  await expect(
    page.getByText(
      /File intake and case actions are blocked because case restoration could not be verified/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/persisted inventory pointer could not be accepted/),
  ).toBeVisible();
  await expect(home).toBeEnabled();
  const pointer = await page.evaluate(
    (caseId) =>
      new TextDecoder().decode(
        (
          globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
        ).__syntheticFiles.get(`cases/${caseId}/manifests/current.json`),
      ),
    id,
  );
  expect(pointer).toBe('{"bad":"pointer"}');
});

test("blocks case actions when a persisted review pointer is invalid", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-RESTORE-REVIEW");
  const id = await page.getByTestId("current-case-id").textContent();
  if (!id) throw new Error("Synthetic case ID missing");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const home = page.getByRole("button", { name: "Return to workspace home" });
  await expect(home).toBeEnabled();
  await home.click();
  await page.evaluate((caseId) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const path = `cases/${caseId}/reviews/current.json`;
    if (!files.has(path)) throw new Error("Expected synthetic review pointer");
    files.set(path, new TextEncoder().encode('{"bad":"review pointer"}'));
  }, id);
  await page.getByRole("button", { name: "Open PBGC-RESTORE-REVIEW" }).click();
  await expect(
    page.getByText(/persisted review state could not be verified/),
  ).toBeVisible();
  await expect(page.getByLabel("Add evidence files")).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Draft V1 summary from R5" }),
  ).toBeHidden();
  await expect(home).toBeEnabled();
});

test("restoration lock works in the built file without HTTP", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) requests.push(request.url());
  });
  await page.route(/^https?:/u, (route) => route.abort());
  const url = pathToFileURL(
    resolve(process.env.PBGC_TEST_ARTIFACT ?? "dist/pbgc-caseworkbench.html"),
  ).href;
  await createSyntheticCase(
    page,
    "PBGC-RESTORE-FILE",
    "synthetic-reviewer",
    "Synthetic Reviewer",
    url,
  );
  const id = await page.getByTestId("current-case-id").textContent();
  if (!id) throw new Error("Synthetic case ID missing");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const home = page.getByRole("button", { name: "Return to workspace home" });
  await expect(home).toBeEnabled();
  await home.click();
  await page.evaluate((caseId) => {
    const g = globalThis as unknown as {
      __syntheticReadGate?: (path: string) => Promise<void>;
      __restoreEntered?: boolean;
      __releaseRestore?: () => void;
    };
    g.__syntheticReadGate = async (path) => {
      if (path === `cases/${caseId}/manifests/current.json`) {
        g.__restoreEntered = true;
        await new Promise<void>((done) => {
          g.__releaseRestore = done;
        });
        g.__syntheticReadGate = undefined;
      }
    };
  }, id);
  await page.getByRole("button", { name: "Open PBGC-RESTORE-FILE" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __restoreEntered?: boolean })
            .__restoreEntered,
      ),
    )
    .toBe(true);
  await expect(home).toBeDisabled();
  await expect(page.getByLabel("Add evidence files")).toBeHidden();
  await page.evaluate(() =>
    (
      globalThis as unknown as { __releaseRestore?: () => void }
    ).__releaseRestore?.(),
  );
  await expect(home).toBeEnabled();
  await expect(page.getByLabel("Add evidence files")).toBeEnabled();
  expect(outboundRequests).toEqual([]);
  expect(requests).toEqual([]);
});

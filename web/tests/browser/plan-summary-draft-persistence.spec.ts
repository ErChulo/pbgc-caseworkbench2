import { hashTyped } from "../../src/domain/manifests/canonical-json";
import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

test("saves and restores only an empty case-bound Plan Summary draft", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-SUMMARY-DRAFT");
  const initialize = page.getByRole("button", {
    name: "Initialize Plan Summary",
  });
  await expect(initialize).toBeDisabled();
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence."),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await expect(initialize).toBeEnabled();
  await initialize.click();
  const summary = page.getByRole("region", { name: "Plan Summary" });
  await expect(
    summary.getByText(
      "Empty Plan Summary draft saved locally. It is not an approval.",
    ),
  ).toBeVisible();
  await expect(summary.getByText("0/0 attributes approved")).toBeVisible();
  await expect(summary.getByText("DRAFT", { exact: true })).toBeVisible();
  const home = page.getByRole("button", { name: "Return to workspace home" });
  await expect(home).toBeEnabled();
  await home.click();
  await page.getByRole("button", { name: "Open PBGC-SUMMARY-DRAFT" }).click();
  await expect(summary.getByText("0/0 attributes approved")).toBeVisible();
  await expect(summary.getByText("DRAFT", { exact: true })).toBeVisible();
  await expect(initialize).toHaveCount(0);
  expect(outboundRequests).toEqual([]);
});

test("does not claim success when the saved review pointer changes before readback", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-SUMMARY-TAMPER");
  const id = await page.getByTestId("current-case-id").textContent();
  if (!id) throw new Error("Synthetic case ID missing");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence."),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await page.evaluate((caseId) => {
    const g = globalThis as unknown as {
      __syntheticReadGate?: (path: string) => Promise<void>;
      __syntheticFiles: Map<string, Uint8Array>;
    };
    const target = `cases/${caseId}/reviews/current.json`;
    g.__syntheticReadGate = (path) => {
      if (path === target) {
        g.__syntheticFiles.set(
          path,
          new TextEncoder().encode('{"bad":"pointer"}'),
        );
        g.__syntheticReadGate = undefined;
      }
      return Promise.resolve();
    };
  }, id);
  await page.getByRole("button", { name: "Initialize Plan Summary" }).click();
  await expect(
    page.getByText(/Plan Summary draft or review pointer may have been saved/),
  ).toBeVisible();
  await expect(page.getByLabel("Add evidence files")).toBeDisabled();
  await expect(page.getByRole("region", { name: "Plan Summary" })).toBeHidden();
});

test("does not display an old case draft after switching during its pointer write", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-SUMMARY-OLD");
  const id = await page.getByTestId("current-case-id").textContent();
  if (!id) throw new Error("Synthetic case ID missing");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence."),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await page.evaluate((caseId) => {
    const g = globalThis as unknown as {
      __syntheticWriteGate?: (path: string) => Promise<void>;
      __summaryGateEntered?: boolean;
      __releaseSummary?: () => void;
    };
    g.__syntheticWriteGate = async (path) => {
      if (path === `cases/${caseId}/reviews/current.json`) {
        g.__summaryGateEntered = true;
        await new Promise<void>((done) => {
          g.__releaseSummary = done;
        });
        g.__syntheticWriteGate = undefined;
      }
    };
  }, id);
  await page.getByRole("button", { name: "Initialize Plan Summary" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __summaryGateEntered?: boolean })
            .__summaryGateEntered,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByLabel("Case number").fill("PBGC-SUMMARY-NEW");
  await page.getByRole("button", { name: "Create production case" }).click();
  await expect(page.getByTestId("active-case-authoritative-id")).toHaveText(
    "PBGC-SUMMARY-NEW",
  );
  await page.evaluate(() =>
    (
      globalThis as unknown as { __releaseSummary?: () => void }
    ).__releaseSummary?.(),
  );
  const summary = page.getByRole("region", { name: "Plan Summary" });
  await expect(
    summary.getByRole("button", { name: "Initialize Plan Summary" }),
  ).toBeDisabled();
  await expect(summary.getByText("0/0 attributes approved")).toHaveCount(0);
  await expect(summary.getByText(/draft saved locally/)).toHaveCount(0);
});

test("saves and restores an empty draft from the built file without HTTP", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  const { resolve } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
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
    "PBGC-SUMMARY-FILE",
    "synthetic-reviewer",
    "Synthetic Reviewer",
    url,
  );
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence."),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await page.getByRole("button", { name: "Initialize Plan Summary" }).click();
  const summary = page.getByRole("region", { name: "Plan Summary" });
  await expect(
    summary.getByText(
      "Empty Plan Summary draft saved locally. It is not an approval.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByRole("button", { name: "Open PBGC-SUMMARY-FILE" }).click();
  await expect(summary.getByText("0/0 attributes approved")).toBeVisible();
  expect(outboundRequests).toEqual([]);
  expect(requests).toEqual([]);
});

test("blocks a populated or otherwise unsupported summary even with a valid outer review hash", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-SUMMARY-UNSUPPORTED");
  const id = await page.getByTestId("current-case-id").textContent();
  if (!id) throw new Error("Synthetic case ID missing");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence."),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await page.getByRole("button", { name: "Initialize Plan Summary" }).click();
  await expect(
    page.getByText(
      "Empty Plan Summary draft saved locally. It is not an approval.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  const serialized = await page.evaluate((caseId) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const pointer = JSON.parse(
      new TextDecoder().decode(
        files.get(`cases/${caseId}/reviews/current.json`),
      ),
    ) as { reviewSnapshotId: string };
    return new TextDecoder().decode(
      files.get(
        `cases/${caseId}/reviews/snapshots/${pointer.reviewSnapshotId}.json`,
      ),
    );
  }, id);
  const review = JSON.parse(serialized) as Record<string, unknown>;
  const summary = review.planSummaryRecord as Record<string, unknown>;
  summary.overallStatus = "final";
  const { reviewSnapshotId: ignored, ...payload } = review;
  void ignored;
  const hash = await hashTyped(payload, { typeName: "CaseReviewSnapshot" });
  await page.evaluate(
    ({ caseId, content, hashValue }) => {
      const files = (
        globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
      ).__syntheticFiles;
      files.set(
        `cases/${caseId}/reviews/snapshots/${hashValue}.json`,
        new TextEncoder().encode(content),
      );
      files.set(
        `cases/${caseId}/reviews/current.json`,
        new TextEncoder().encode(
          JSON.stringify({ reviewSnapshotId: hashValue, writtenAt: null }),
        ),
      );
    },
    {
      caseId: id,
      content: JSON.stringify({ ...payload, reviewSnapshotId: hash }),
      hashValue: hash,
    },
  );
  await page
    .getByRole("button", { name: "Open PBGC-SUMMARY-UNSUPPORTED" })
    .click();
  await expect(
    page.getByText(/Populated-summary restoration is not yet supported/),
  ).toBeVisible();
  await expect(page.getByLabel("Add evidence files")).toBeDisabled();
});

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

const contentA = Buffer.from("Synthetic first evidence.");
const contentB = Buffer.from("Synthetic second evidence.");
const hashA = createHash("sha256").update(contentA).digest("hex");

async function prepare(
  page: import("@playwright/test").Page,
  caseNumber: string,
) {
  await createSyntheticCase(page, caseNumber);
  await page.getByLabel("Add evidence files").setInputFiles([
    { name: "first.txt", mimeType: "text/plain", buffer: contentA },
    { name: "second.txt", mimeType: "text/plain", buffer: contentB },
  ]);
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await page.evaluate((hash) => {
    const globals = globalThis as unknown as {
      __syntheticReadGate?: (path: string) => Promise<void>;
      __viewerGateEntered?: boolean;
      __viewerGateFinished?: boolean;
      __releaseViewerGate?: () => void;
    };
    const blockedPath = `objects/sha256/${hash.slice(0, 2)}/${hash}`;
    globals.__syntheticReadGate = async (path) => {
      if (path !== blockedPath) return;
      globals.__viewerGateEntered = true;
      await new Promise<void>((resolve) => {
        globals.__releaseViewerGate = resolve;
      });
      globals.__viewerGateFinished = true;
    };
  }, hashA);
}

async function open(page: import("@playwright/test").Page, name: string) {
  await page
    .getByRole("table", { name: "Provisional artifact inventory" })
    .getByRole("row", { name: new RegExp(name, "u") })
    .getByRole("button", { name: /Open evidence/u })
    .click();
}

async function release(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const globals = globalThis as unknown as {
      __releaseViewerGate?: () => void;
      __syntheticReadGate?: (path: string) => Promise<void>;
    };
    globals.__syntheticReadGate = undefined;
    globals.__releaseViewerGate?.();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __viewerGateFinished?: boolean })
            .__viewerGateFinished,
      ),
    )
    .toBe(true);
}

test("a slower viewer request cannot replace a later selection", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await prepare(page, "PBGC-VIEW-SELECTION-RACE");
  await open(page, "first.txt");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __viewerGateEntered?: boolean })
            .__viewerGateEntered,
      ),
    )
    .toBe(true);
  await open(page, "second.txt");
  await expect(
    page.getByRole("region", { name: "Evidence viewer" }),
  ).toContainText("second.txt");
  await release(page);
  await expect(
    page.getByRole("region", { name: "Evidence viewer" }),
  ).toContainText("second.txt");
  await expect(
    page.getByRole("region", { name: "Evidence viewer" }),
  ).not.toContainText("first.txt");
  expect(outboundRequests).toEqual([]);
});

test("closing a pending viewer prevents the result from reopening it", async ({
  offlinePage: page,
}) => {
  await prepare(page, "PBGC-VIEW-CLOSE-RACE");
  await open(page, "first.txt");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __viewerGateEntered?: boolean })
            .__viewerGateEntered,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Close viewer" }).click();
  await release(page);
  await expect(
    page.getByRole("heading", { name: "Evidence viewer" }),
  ).not.toBeVisible();
});

test("opens the verified synthetic evidence from the built file", async ({
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
    "PBGC-VIEW-FILE",
    "synthetic-reviewer",
    "Synthetic Reviewer",
    url,
  );
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "first.txt",
    mimeType: "text/plain",
    buffer: contentA,
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await open(page, "first.txt");
  await expect(
    page.getByRole("region", { name: "Evidence viewer" }),
  ).toContainText("Synthetic first evidence.");
  expect(outboundRequests).toEqual([]);
  expect(requests).toEqual([]);
});

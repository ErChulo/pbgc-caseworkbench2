import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

test("closing during correction save stops the stale pointer before publication", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-CORRECTION-RACE");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Original synthetic text."),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const row = page
    .getByRole("table", { name: "Provisional artifact inventory" })
    .getByRole("row", { name: /synthetic.txt/u });
  await row.getByRole("button", { name: /Open evidence/u }).click();
  await page
    .getByLabel("Human-corrected text")
    .fill("First synthetic correction.");
  await page.evaluate(() => {
    const g = globalThis as unknown as {
      __syntheticWriteGate?: (path: string) => Promise<void>;
      __releaseCorrection?: () => void;
      __correctionGateEntered?: boolean;
      __pointerWrites?: number;
    };
    g.__pointerWrites = 0;
    let gateUsed = false;
    g.__syntheticWriteGate = async (path) => {
      if (path.includes("/corrections/") && path.endsWith("/current.json"))
        g.__pointerWrites = (g.__pointerWrites ?? 0) + 1;
      if (
        !gateUsed &&
        path.includes("/corrections/") &&
        !path.endsWith("/current.json")
      ) {
        gateUsed = true;
        g.__correctionGateEntered = true;
        await new Promise<void>((done) => {
          g.__releaseCorrection = done;
        });
      }
    };
  });
  await page.getByRole("button", { name: "Save corrected text" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __correctionGateEntered?: boolean })
            .__correctionGateEntered,
      ),
    )
    .toBe(true);
  await expect(page.getByLabel("Human-corrected text")).toBeDisabled();
  await page.getByRole("button", { name: "Close viewer" }).click();
  await page.evaluate(() =>
    (
      globalThis as unknown as { __releaseCorrection?: () => void }
    ).__releaseCorrection?.(),
  );
  await row.getByRole("button", { name: /Open evidence/u }).click();
  await expect(page.getByLabel("Human-corrected text")).toHaveValue(
    "Original synthetic text.",
  );
  await page
    .getByLabel("Human-corrected text")
    .fill("Second synthetic correction.");
  // A completed subsequent save proves the first operation released its guard.
  await page.getByRole("button", { name: "Save corrected text" }).click();
  await expect(page.getByText(/Corrected text saved separately/)).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (globalThis as unknown as { __pointerWrites?: number }).__pointerWrites,
    ),
  ).toBe(1);
  expect(outboundRequests).toEqual([]);
});

test("blocks review changes while a correction pointer is being written", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-CORRECTION-REVIEW-RACE");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic-plan.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Executed Defined Benefit Plan Document effective 2020-01-01.",
    ),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await page
    .getByRole("table", { name: "Provisional artifact inventory" })
    .getByRole("row", { name: /synthetic-plan.txt/u })
    .getByRole("button", { name: /Open evidence/u })
    .click();
  await page
    .getByLabel("Human-corrected text")
    .fill("Synthetic corrected plan document.");
  const classification = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Classification review" }),
  });
  await classification.getByLabel("Reviewer name").fill("Synthetic Reviewer");
  await classification
    .getByLabel("Rationale")
    .fill("Synthetic classification review.");
  await page.evaluate(() => {
    const g = globalThis as unknown as {
      __syntheticWriteGate?: (path: string) => Promise<void>;
      __pointerGateEntered?: boolean;
      __releasePointer?: () => void;
    };
    g.__syntheticWriteGate = async (path) => {
      if (path.includes("/corrections/") && path.endsWith("/current.json")) {
        g.__pointerGateEntered = true;
        await new Promise<void>((done) => {
          g.__releasePointer = done;
        });
      }
    };
  });
  await page.getByRole("button", { name: "Save corrected text" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __pointerGateEntered?: boolean })
            .__pointerGateEntered,
      ),
    )
    .toBe(true);
  const first = classification.locator("li").first();
  await expect(first.getByRole("button", { name: "Approve" })).toBeDisabled();
  await expect(page.getByLabel("Add evidence files")).toBeDisabled();
  await page.evaluate(() =>
    (
      globalThis as unknown as { __releasePointer?: () => void }
    ).__releasePointer?.(),
  );
  await expect(page.getByText(/Corrected text saved separately/)).toBeVisible();
  await expect(first.getByRole("button", { name: "Approve" })).toBeEnabled();
});

test("saves a synthetic correction from the built file with HTTP blocked", async ({
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
    "PBGC-CORRECTION-FILE",
    "synthetic-reviewer",
    "Synthetic Reviewer",
    url,
  );
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Original synthetic text."),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await page
    .getByRole("table", { name: "Provisional artifact inventory" })
    .getByRole("row", { name: /synthetic.txt/u })
    .getByRole("button", { name: /Open evidence/u })
    .click();
  await page
    .getByLabel("Human-corrected text")
    .fill("Synthetic correction for local review.");
  await page.getByRole("button", { name: "Save corrected text" }).click();
  await expect(page.getByText(/Corrected text saved separately/)).toBeVisible();
  expect(outboundRequests).toEqual([]);
  expect(requests).toEqual([]);
});

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

async function exerciseSwitch(
  page: Page,
  outboundRequests: string[],
  fileMode: boolean,
) {
  const requests: string[] = [];
  if (fileMode) {
    page.on("request", (request) => {
      if (/^https?:/u.test(request.url())) requests.push(request.url());
    });
    await page.route(/^https?:/u, (route) => route.abort());
  }
  const url = fileMode
    ? pathToFileURL(
        resolve(
          process.env.PBGC_TEST_ARTIFACT ?? "dist/pbgc-caseworkbench.html",
        ),
      ).href
    : "/";
  await createSyntheticCase(
    page,
    "PBGC-INTAKE-CASE-SWITCH",
    "synthetic-reviewer",
    "Synthetic Reviewer",
    url,
  );
  const bytes = Buffer.from("Synthetic evidence to preserve.");
  const hash = createHash("sha256").update(bytes).digest("hex");
  await page.evaluate((sha) => {
    const g = globalThis as unknown as {
      __syntheticWriteGate?: (path: string) => Promise<void>;
      __intakeGateEntered?: boolean;
      __releaseIntake?: () => void;
    };
    const path = `objects/sha256/${sha.slice(0, 2)}/${sha}`;
    g.__syntheticWriteGate = async (value) => {
      if (value === path) {
        g.__intakeGateEntered = true;
        await new Promise<void>((done) => {
          g.__releaseIntake = done;
        });
      }
    };
  }, hash);
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: bytes,
  });
  const leave = page.getByRole("button", { name: "Return to workspace home" });
  await expect(leave).toBeDisabled();
  await expect(
    page.getByText("Stop or finish file intake before switching cases."),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __intakeGateEntered?: boolean })
            .__intakeGateEntered,
      ),
    )
    .toBe(true);
  await expect(leave).toBeDisabled();
  await page.evaluate(() =>
    (
      globalThis as unknown as { __releaseIntake?: () => void }
    ).__releaseIntake?.(),
  );
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await expect(leave).toBeEnabled();
  await leave.click();
  await expect(
    page.getByRole("button", { name: "Open PBGC-INTAKE-CASE-SWITCH" }),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
  expect(requests).toEqual([]);
}

for (const mode of ["development", "file"] as const) {
  test(`requires intake to finish before leaving the case (${mode})`, async ({
    offlinePage,
    outboundRequests,
  }) => {
    await exerciseSwitch(offlinePage, outboundRequests, mode === "file");
  });
}

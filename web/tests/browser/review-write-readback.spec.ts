import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

for (const target of ["event", "snapshot", "pointer"] as const) {
  test(`blocks the case when the ${target} changes during review readback`, async ({
    offlinePage: page,
  }) => {
    await createSyntheticCase(
      page,
      `PBGC-REVIEW-READBACK-${target.toUpperCase()}`,
    );
    await page.getByLabel("Add evidence files").setInputFiles({
      name: "synthetic-plan.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic executed plan document."),
    });
    await expect(page.getByText("File inventory complete")).toBeVisible();
    const id = await page.getByTestId("current-case-id").textContent();
    if (!id) throw new Error("Case ID missing");
    const eligibility = page.getByRole("region", {
      name: "Artifact eligibility review",
    });
    await eligibility.getByLabel("Reviewer name").fill("synthetic-reviewer");
    await eligibility.getByLabel("Rationale").fill("Synthetic review.");
    const item = eligibility
      .locator("li")
      .filter({ hasText: "synthetic-plan.txt" });
    await expect(
      item.getByRole("button", { name: "Approve governed use" }),
    ).toBeEnabled();
    await page.evaluate(
      ({ caseId, kind }) => {
        const g = globalThis as unknown as {
          __syntheticReadGate?: (path: string) => Promise<void>;
          __syntheticFiles: Map<string, Uint8Array>;
          __corruptedReview?: boolean;
        };
        g.__syntheticReadGate = (path) => {
          const match =
            kind === "event"
              ? path === `cases/${caseId}/reviews/events.jsonl`
              : kind === "pointer"
                ? path === `cases/${caseId}/reviews/current.json`
                : path.startsWith(`cases/${caseId}/reviews/snapshots/`);
          // For an event, the first read observes the old history before append;
          // corrupt only the second read, after the append has completed.
          if (match && (kind !== "event" || g.__syntheticFiles.has(path))) {
            g.__syntheticFiles.set(
              path,
              new TextEncoder().encode("corrupted synthetic bytes"),
            );
            g.__corruptedReview = true;
            delete g.__syntheticReadGate;
          }
          return Promise.resolve();
        };
      },
      { caseId: id, kind: target },
    );
    await item.getByRole("button", { name: "Approve governed use" }).click();
    await expect(
      page.getByText(
        /review event or snapshot may have been saved but could not be verified/,
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Add evidence files")).toBeDisabled();
    await expect(eligibility).toBeHidden();
    expect(
      await page.evaluate(
        () =>
          (globalThis as unknown as { __corruptedReview?: boolean })
            .__corruptedReview,
      ),
    ).toBe(true);
  });
}

test("blocks an oversized review event history before appending", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-REVIEW-EVENT-LIMIT");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence."),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const id = await page.getByTestId("current-case-id").textContent();
  if (!id) throw new Error("Case ID missing");
  const eligibility = page.getByRole("region", {
    name: "Artifact eligibility review",
  });
  await eligibility.getByLabel("Reviewer name").fill("synthetic-reviewer");
  await eligibility.getByLabel("Rationale").fill("Synthetic review.");
  await page.evaluate((caseId) => {
    const g = globalThis as unknown as {
      __syntheticFiles: Map<string, Uint8Array>;
    };
    g.__syntheticFiles.set(
      `cases/${caseId}/reviews/events.jsonl`,
      new Uint8Array(16 * 1024 * 1024 + 1),
    );
  }, id);
  await eligibility
    .locator("li")
    .filter({ hasText: "synthetic.txt" })
    .getByRole("button", { name: "Approve governed use" })
    .click();
  await expect(
    page.getByText(
      /review event or snapshot may have been saved but could not be verified/,
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Add evidence files")).toBeDisabled();
});

test("blocks altered review pointer in the offline built file", async ({
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
    "PBGC-REVIEW-READBACK-FILE",
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
  const id = await page.getByTestId("current-case-id").textContent();
  if (!id) throw new Error("Case ID missing");
  const eligibility = page.getByRole("region", {
    name: "Artifact eligibility review",
  });
  await eligibility.getByLabel("Reviewer name").fill("synthetic-reviewer");
  await eligibility.getByLabel("Rationale").fill("Synthetic review.");
  await page.evaluate((caseId) => {
    const g = globalThis as unknown as {
      __syntheticReadGate?: (path: string) => Promise<void>;
      __syntheticFiles: Map<string, Uint8Array>;
    };
    g.__syntheticReadGate = (path) => {
      if (path === `cases/${caseId}/reviews/current.json`) {
        g.__syntheticFiles.set(path, new TextEncoder().encode("invalid"));
        delete g.__syntheticReadGate;
      }
      return Promise.resolve();
    };
  }, id);
  await eligibility
    .locator("li")
    .filter({ hasText: "synthetic.txt" })
    .getByRole("button", { name: "Approve governed use" })
    .click();
  await expect(
    page.getByText(
      /review event or snapshot may have been saved but could not be verified/,
    ),
  ).toBeVisible();
  expect(requests).toEqual([]);
  expect(outboundRequests).toEqual([]);
});

test("a review saved after reopening can itself be reopened", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-REVIEW-REOPEN");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic-plan.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic executed plan document."),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const eligibility = page.getByRole("region", {
    name: "Artifact eligibility review",
  });
  await eligibility.getByLabel("Reviewer name").fill("synthetic-reviewer");
  await eligibility.getByLabel("Rationale").fill("Synthetic review.");
  await eligibility
    .locator("li")
    .filter({ hasText: "synthetic-plan.txt" })
    .getByRole("button", { name: "Approve governed use" })
    .click();
  await expect(
    eligibility.getByText("Eligible", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Return to workspace home" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByRole("button", { name: "Open PBGC-REVIEW-REOPEN" }).click();
  await expect(
    page.getByText("Evidence restored from this case's persisted manifest."),
  ).toBeVisible();
  const classification = page.getByRole("region", {
    name: "Classification review",
  });
  await classification.getByLabel("Reviewer name").fill("synthetic-reviewer");
  await classification
    .getByLabel("Rationale")
    .fill("Synthetic classification review.");
  const first = classification.locator("li").first();
  await first.getByRole("button", { name: "Approve" }).click();
  await expect(first.getByText("Approved", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Return to workspace home" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByRole("button", { name: "Open PBGC-REVIEW-REOPEN" }).click();
  await expect(
    page.getByText("Evidence restored from this case's persisted manifest."),
  ).toBeVisible();
  await expect(first.getByText("Approved", { exact: true })).toBeVisible();
});

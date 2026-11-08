import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

for (const mode of ["development", "file"] as const) {
  test(`new same-byte safety findings block prior eligibility (${mode})`, async ({
    offlinePage: page,
    outboundRequests,
  }) => {
    const requests: string[] = [];
    if (mode === "file") {
      page.on("request", (request) => {
        if (/^https?:/u.test(request.url())) requests.push(request.url());
      });
      await page.route(/^https?:/u, (route) => route.abort());
    }
    const url =
      mode === "file"
        ? pathToFileURL(
            resolve(
              process.env.PBGC_TEST_ARTIFACT ?? "dist/pbgc-caseworkbench.html",
            ),
          ).href
        : "/";
    await createSyntheticCase(
      page,
      "PBGC-SAME-BYTE-GATE",
      "synthetic-reviewer",
      "Synthetic Reviewer",
      url,
    );
    const picker = page.getByLabel("Add evidence files");
    const bytes = Buffer.from("Synthetic inert plan evidence text.");
    await picker.setInputFiles({
      name: "synthetic-plan.txt",
      mimeType: "text/plain",
      buffer: bytes,
    });
    await expect(page.getByText("File inventory complete")).toBeVisible();
    const eligibility = page.getByRole("region", {
      name: "Artifact eligibility review",
    });
    await eligibility.getByLabel("Reviewer name").fill("synthetic-reviewer");
    await eligibility
      .getByLabel("Rationale")
      .fill("Synthetic exact-byte review.");
    const item = eligibility
      .locator("li")
      .filter({ hasText: "synthetic-plan.txt" });
    await item.getByRole("button", { name: "Approve governed use" }).click();
    await expect(item.getByText("Eligible", { exact: true })).toBeVisible();
    await expect(picker).toBeEnabled();
    await picker.setInputFiles({
      name: "synthetic-script.ps1",
      mimeType: "text/plain",
      buffer: bytes,
    });
    await expect(page.getByText("File inventory complete")).toBeVisible();
    const quarantine = page.getByRole("region", { name: "Quarantine queue" });
    await expect(
      quarantine.getByText("executable", { exact: true }),
    ).toBeVisible();
    await expect(
      item.getByText("Release required", { exact: true }),
    ).toBeVisible();
    await expect(item.getByText("blocked", { exact: true })).toBeVisible();
    await expect(
      item.getByRole("button", { name: "Approve governed use" }),
    ).toBeDisabled();
    await quarantine
      .getByRole("button", { name: "Release safety hold" })
      .click();
    await expect(
      item.getByText("Safety hold released", { exact: true }),
    ).toBeVisible();
    await expect(item.getByText("blocked", { exact: true })).toBeVisible();
    await expect(
      item.getByText(/Existing eligibility history may not cover/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Return to workspace home" })
      .click();
    await page
      .getByRole("button", { name: "Open PBGC-SAME-BYTE-GATE" })
      .click();
    await expect(
      page.getByText("Evidence restored from this case's persisted manifest."),
    ).toBeVisible();
    await expect(
      item.getByText("Safety hold released", { exact: true }),
    ).toBeVisible();
    await expect(item.getByText("blocked", { exact: true })).toBeVisible();
    expect(outboundRequests).toEqual([]);
    expect(requests).toEqual([]);
  });
}

test("new findings cannot inherit an earlier same-byte safety release", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-NEW-FINDINGS");
  const picker = page.getByLabel("Add evidence files");
  const bytes = Buffer.from("Synthetic inert text, not executable.");
  await picker.setInputFiles({
    name: "first.ps1",
    mimeType: "text/plain",
    buffer: bytes,
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const quarantine = page.getByRole("region", { name: "Quarantine queue" });
  await quarantine.getByLabel("Reviewer name").fill("synthetic-reviewer");
  await quarantine.getByLabel("Rationale").fill("Synthetic safety review.");
  await quarantine.getByRole("button", { name: "Release safety hold" }).click();
  const eligibility = page.getByRole("region", {
    name: "Artifact eligibility review",
  });
  const item = eligibility.locator("li").filter({ hasText: "first.ps1" });
  await item.getByRole("button", { name: "Approve governed use" }).click();
  await expect(item.getByText("Eligible", { exact: true })).toBeVisible();
  await expect(picker).toBeEnabled();
  await picker.setInputFiles({
    name: "second.js",
    mimeType: "text/plain",
    buffer: bytes,
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const queueItem = quarantine.locator("li").filter({ hasText: "second.js" });
  await expect(
    queueItem.getByText(/New findings are not covered by the earlier release/),
  ).toBeVisible();
  await expect(
    queueItem.getByRole("button", { name: "Inherit safety release" }),
  ).toBeDisabled();
  await expect(
    queueItem.getByRole("button", { name: "Release safety hold" }),
  ).toBeDisabled();
  await expect(item.getByText("blocked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByRole("button", { name: "Open PBGC-NEW-FINDINGS" }).click();
  await expect(
    page.getByText("Evidence restored from this case's persisted manifest."),
  ).toBeVisible();
  await expect(
    queueItem.getByRole("button", { name: "Inherit safety release" }),
  ).toBeDisabled();
  await expect(
    queueItem.getByRole("button", { name: "Release safety hold" }),
  ).toBeDisabled();
  await expect(item.getByText("blocked", { exact: true })).toBeVisible();
});

test("safety review blocks same-session intake and case switching until it finishes", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-SAFETY-LOCK");
  const picker = page.getByLabel("Add evidence files");
  await picker.setInputFiles({
    name: "first.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic local evidence."),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const eligibility = page.getByRole("region", {
    name: "Artifact eligibility review",
  });
  await eligibility.getByLabel("Reviewer name").fill("synthetic-reviewer");
  await eligibility.getByLabel("Rationale").fill("Synthetic review.");
  await page.evaluate(() => {
    const g = globalThis as unknown as {
      __syntheticWriteGate?: (path: string) => Promise<void>;
      __safetyGateEntered?: boolean;
      __releaseSafetyGate?: () => void;
    };
    g.__syntheticWriteGate = async (path) => {
      if (path.endsWith("/reviews/events.jsonl")) {
        g.__safetyGateEntered = true;
        await new Promise<void>((done) => {
          g.__releaseSafetyGate = done;
        });
        delete g.__syntheticWriteGate;
      }
    };
  });
  const item = eligibility.locator("li").filter({ hasText: "first.txt" });
  await item.getByRole("button", { name: "Approve governed use" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __safetyGateEntered?: boolean })
            .__safetyGateEntered,
      ),
    )
    .toBe(true);
  await expect(picker).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Return to workspace home" }),
  ).toBeDisabled();
  await page.evaluate(() =>
    (
      globalThis as unknown as { __releaseSafetyGate?: () => void }
    ).__releaseSafetyGate?.(),
  );
  await expect(item.getByText("Eligible", { exact: true })).toBeVisible();
  await expect(picker).toBeEnabled();
});

test("classification review and intake cannot overlap in the same session", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-REVIEW-LOCK");
  const picker = page.getByLabel("Add evidence files");
  await picker.setInputFiles({
    name: "synthetic-plan.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Synthetic executed plan document effective 2020-01-01.",
    ),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const classification = page.getByRole("region", {
    name: "Classification review",
  });
  await expect(picker).toBeEnabled();
  await classification.getByLabel("Reviewer name").fill("synthetic-reviewer");
  await classification.getByLabel("Rationale").fill("Synthetic review.");
  await expect(classification.getByLabel("Rationale")).toHaveValue(
    "Synthetic review.",
  );
  await page.evaluate(() => {
    const g = globalThis as unknown as {
      __syntheticWriteGate?: (path: string) => Promise<void>;
      __reviewGateEntered?: boolean;
      __releaseReviewGate?: () => void;
    };
    g.__syntheticWriteGate = async (path) => {
      if (path.endsWith("/reviews/events.jsonl")) {
        g.__reviewGateEntered = true;
        await new Promise<void>((done) => {
          g.__releaseReviewGate = done;
        });
        delete g.__syntheticWriteGate;
      }
    };
  });
  const first = classification.locator("li").first();
  await first.getByRole("button", { name: "Approve" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __reviewGateEntered?: boolean })
            .__reviewGateEntered,
      ),
    )
    .toBe(true);
  await expect(picker).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Return to workspace home" }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("region", { name: "Artifact eligibility review" })
      .getByRole("button", { name: "Approve governed use" })
      .first(),
  ).toBeDisabled();
  await page.evaluate(() =>
    (
      globalThis as unknown as { __releaseReviewGate?: () => void }
    ).__releaseReviewGate?.(),
  );
  await expect(first.getByText("Approved", { exact: true })).toBeVisible();
  await expect(picker).toBeEnabled();
});

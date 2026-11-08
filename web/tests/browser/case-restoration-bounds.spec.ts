import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

for (const target of [
  "manifest-pointer",
  "manifest-record",
  "review-pointer",
  "review-record",
] as const) {
  test(`blocks oversized ${target} during synthetic case restoration`, async ({
    offlinePage: page,
  }) => {
    await createSyntheticCase(page, `PBGC-BOUND-${target}`);
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
    await page.evaluate(
      ({ caseId, kind }) => {
        const files = (
          globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
        ).__syntheticFiles;
        const isReview = kind.startsWith("review");
        const pointer = `cases/${caseId}/${isReview ? "reviews" : "manifests"}/current.json`;
        const storedPointer = files.get(pointer);
        if (!storedPointer) throw new Error("Synthetic pointer missing");
        let path = pointer;
        if (kind.endsWith("record")) {
          const value = JSON.parse(new TextDecoder().decode(storedPointer)) as {
            reviewSnapshotId?: string;
            checkpointSnapshotId?: string;
          };
          const hash = isReview
            ? value.reviewSnapshotId
            : value.checkpointSnapshotId;
          if (!hash) throw new Error("Synthetic pointer hash missing");
          path = isReview
            ? `cases/${caseId}/reviews/snapshots/${hash}.json`
            : `cases/${caseId}/manifests/${hash}.json`;
        }
        if (!files.has(path)) throw new Error("Synthetic record missing");
        files.set(
          path,
          new Uint8Array(
            kind.endsWith("pointer") ? 64 * 1024 + 1 : 16 * 1024 * 1024 + 1,
          ).fill(32),
        );
      },
      { caseId: id, kind: target },
    );
    await page
      .getByRole("button", { name: `Open PBGC-BOUND-${target}` })
      .click();
    await expect(
      page.getByText(/File intake and case actions are blocked/),
    ).toBeVisible();
    await expect(page.getByLabel("Add evidence files")).toBeDisabled();
    await expect(home).toBeEnabled();
  });
}

test("blocks an oversized pointer from the built file with HTTP blocked", async ({
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
    "PBGC-BOUND-FILE",
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
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    files.set(
      `cases/${caseId}/manifests/current.json`,
      new Uint8Array(64 * 1024 + 1).fill(32),
    );
  }, id);
  await page.getByRole("button", { name: "Open PBGC-BOUND-FILE" }).click();
  await expect(
    page.getByText(/File intake and case actions are blocked/),
  ).toBeVisible();
  await expect(page.getByLabel("Add evidence files")).toBeDisabled();
  expect(outboundRequests).toEqual([]);
  expect(requests).toEqual([]);
});

test("blocks further case actions after an intake persistence exception", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-INTAKE-PARTIAL");
  const id = await page.getByTestId("current-case-id").textContent();
  if (!id) throw new Error("Synthetic case ID missing");
  await page.evaluate((caseId) => {
    const globals = globalThis as unknown as {
      __syntheticWriteGate?: (path: string) => Promise<void>;
    };
    globals.__syntheticWriteGate = (path) => {
      if (path === `cases/${caseId}/manifests/current.json`)
        throw new Error("Synthetic write failure");
      return Promise.resolve();
    };
  }, id);
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence"),
  });
  await expect(
    page.getByText(
      /Intake did not finish. Some files or records may have been saved/,
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Add evidence files")).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Draft V1 summary from R5" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Return to workspace home" }),
  ).toBeEnabled();
});

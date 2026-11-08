import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

test("generates and restores a blocked draft and rejects tampered saved content", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-DRAFT-INTEGRITY");
  const caseId = await page.getByTestId("current-case-id").textContent();
  if (!caseId) throw new Error("Synthetic case ID missing");
  const panel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Draft V1 summary from R5" }),
  });
  await panel.getByLabel("Select R5 summary JSON").setInputFiles({
    name: "synthetic.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ fields: ["DOB"] })),
  });
  await expect(panel.getByText(/Blocked draft V1 summary saved/)).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "Blockers preserved in draft" }),
  ).toBeVisible();
  const saved = await page.evaluate((id) => {
    const globals = globalThis as unknown as {
      __syntheticFiles: Map<string, Uint8Array>;
    };
    const path = `cases/${id}/outputs/draft-v1-summary.json`;
    const bytes = globals.__syntheticFiles.get(path);
    if (!bytes) throw new Error("Synthetic draft missing");
    const value = JSON.parse(new TextDecoder().decode(bytes)) as {
      deterministicPayload: { draftStatus: string };
    };
    return value.deterministicPayload.draftStatus;
  }, caseId);
  expect(saved).toBe("blocked");
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByRole("button", { name: "Open PBGC-DRAFT-INTEGRITY" }).click();
  await expect(
    panel.getByRole("heading", { name: "Blockers preserved in draft" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.evaluate((id) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const path = `cases/${id}/outputs/draft-v1-summary.json`;
    const bytes = files.get(path);
    if (!bytes) throw new Error("Synthetic draft missing");
    const value = JSON.parse(new TextDecoder().decode(bytes)) as {
      deterministicPayload: { r5Source: { fileName: string } };
    };
    value.deterministicPayload.r5Source.fileName = "changed.json";
    files.set(path, new TextEncoder().encode(JSON.stringify(value)));
  }, caseId);
  await page.getByRole("button", { name: "Open PBGC-DRAFT-INTEGRITY" }).click();
  await expect(
    panel.getByText(/failed case, contract, or content-hash checks/),
  ).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "Blockers preserved in draft" }),
  ).not.toBeVisible();
  expect(outboundRequests).toEqual([]);
});

test("does not save an old case draft after a case switch during file reading", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-DRAFT-OLD");
  const caseId = await page.getByTestId("current-case-id").textContent();
  if (!caseId) throw new Error("Synthetic case ID missing");
  await page.evaluate(() => {
    const g = globalThis as unknown as {
      __draftGateEntered?: boolean;
      __releaseDraft?: () => void;
    };
    // Preserve the original method to call with the selected File as receiver.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === "slow-draft.json") {
        g.__draftGateEntered = true;
        await new Promise<void>((done) => {
          g.__releaseDraft = done;
        });
      }
      return original.call(this);
    };
  });
  const panel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Draft V1 summary from R5" }),
  });
  await panel.getByLabel("Select R5 summary JSON").setInputFiles({
    name: "slow-draft.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"fields":["DOB"]}'),
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __draftGateEntered?: boolean })
            .__draftGateEntered,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByLabel("Case number").fill("PBGC-DRAFT-NEW");
  await page.getByRole("button", { name: "Create production case" }).click();
  await expect(page.getByTestId("active-case-authoritative-id")).toHaveText(
    "PBGC-DRAFT-NEW",
  );
  await page.evaluate(() =>
    (
      globalThis as unknown as { __releaseDraft?: () => void }
    ).__releaseDraft?.(),
  );
  await expect(panel.getByLabel("Select R5 summary JSON")).toBeEnabled();
  await expect(
    panel.getByRole("heading", { name: "Blockers preserved in draft" }),
  ).not.toBeVisible();
  const oldDraftPresent = await page.evaluate(
    (id) =>
      (
        globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
      ).__syntheticFiles.has(`cases/${id}/outputs/draft-v1-summary.json`),
    caseId,
  );
  expect(oldDraftPresent).toBe(false);
});

test("rejects a draft changed before post-write readback", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-DRAFT-POST-WRITE");
  const caseId = await page.getByTestId("current-case-id").textContent();
  if (!caseId) throw new Error("Synthetic case ID missing");
  await page.evaluate((id) => {
    const g = globalThis as unknown as {
      __syntheticReadGate?: (path: string) => Promise<void>;
      __syntheticFiles: Map<string, Uint8Array>;
    };
    const target = `cases/${id}/outputs/draft-v1-summary.json`;
    g.__syntheticReadGate = (path) => {
      if (path === target) {
        const bytes = g.__syntheticFiles.get(path);
        if (!bytes) throw new Error("Synthetic draft missing");
        const altered = Uint8Array.from(bytes);
        altered[0] = (altered[0] ?? 0) ^ 1;
        g.__syntheticFiles.set(path, altered);
        g.__syntheticReadGate = undefined;
      }
      return Promise.resolve();
    };
  }, caseId);
  const panel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Draft V1 summary from R5" }),
  });
  await panel.getByLabel("Select R5 summary JSON").setInputFiles({
    name: "synthetic.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"fields":["DOB"]}'),
  });
  await expect(
    panel.getByText(/draft or its review event may have been saved/),
  ).toBeVisible();
  await expect(
    panel.getByText(/Blocked draft V1 summary saved/),
  ).not.toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "Blockers preserved in draft" }),
  ).not.toBeVisible();
});

test("generates a blocked synthetic draft from the built file with HTTP blocked", async ({
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
    "PBGC-DRAFT-FILE",
    "synthetic-reviewer",
    "Synthetic Reviewer",
    url,
  );
  const panel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Draft V1 summary from R5" }),
  });
  await panel.getByLabel("Select R5 summary JSON").setInputFiles({
    name: "synthetic.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"fields":["DOB"]}'),
  });
  await expect(panel.getByText(/Blocked draft V1 summary saved/)).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "Blockers preserved in draft" }),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
  expect(requests).toEqual([]);
});

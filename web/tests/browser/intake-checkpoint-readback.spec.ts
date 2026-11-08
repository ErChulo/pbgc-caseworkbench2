import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

for (const target of ["snapshot", "manifest", "event", "pointer"] as const) {
  test(`blocks intake when the ${target} changes during checkpoint readback`, async ({
    offlinePage: page,
  }) => {
    await createSyntheticCase(
      page,
      `PBGC-INTAKE-VERIFY-${target.toUpperCase()}`,
    );
    const caseId = await page.getByTestId("current-case-id").textContent();
    if (!caseId) throw new Error("Case ID missing");
    await page.evaluate(
      ({ id, kind }) => {
        const g = globalThis as unknown as {
          __syntheticReadGate?: (path: string) => Promise<void>;
          __syntheticFiles: Map<string, Uint8Array>;
          __intakeTampered?: boolean;
        };
        g.__syntheticReadGate = (path) => {
          const match =
            kind === "snapshot"
              ? path.startsWith(`cases/${id}/snapshots/`)
              : kind === "manifest"
                ? path.startsWith(`cases/${id}/manifests/`) &&
                  !path.endsWith("/current.json")
                : kind === "event"
                  ? path === `cases/${id}/intake/events.jsonl`
                  : path === `cases/${id}/manifests/current.json`;
          if (match && g.__syntheticFiles.has(path)) {
            g.__syntheticFiles.set(
              path,
              new TextEncoder().encode("synthetic altered data"),
            );
            g.__intakeTampered = true;
            delete g.__syntheticReadGate;
          }
          return Promise.resolve();
        };
      },
      { id: caseId, kind: target },
    );
    await page.getByLabel("Add evidence files").setInputFiles({
      name: "synthetic.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic intake evidence."),
    });
    await expect(
      page.getByText(
        /Intake did not finish. Some files or records may have been saved/,
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Add evidence files")).toBeDisabled();
    await expect(page.getByText("File inventory complete")).toHaveCount(0);
    const result = await page.evaluate((id) => {
      const g = globalThis as unknown as {
        __syntheticFiles: Map<string, Uint8Array>;
        __intakeTampered?: boolean;
      };
      return {
        tampered: g.__intakeTampered,
        pointerPresent: g.__syntheticFiles.has(
          `cases/${id}/manifests/current.json`,
        ),
      };
    }, caseId);
    expect(result.tampered).toBe(true);
    if (target !== "pointer") expect(result.pointerPresent).toBe(false);
  });
}

test("does not reuse an externally changed cached manifest on identical reimport", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-CACHED-CHECKPOINT");
  const picker = page.getByLabel("Add evidence files");
  const file = {
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence."),
  };
  await picker.setInputFiles(file);
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await expect(picker).toBeEnabled();
  const caseId = await page.getByTestId("current-case-id").textContent();
  if (!caseId) throw new Error("Case ID missing");
  await page.evaluate((id) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const pointer = files.get(`cases/${id}/manifests/current.json`);
    if (!pointer) throw new Error("Pointer missing");
    const parsed = JSON.parse(new TextDecoder().decode(pointer)) as {
      checkpointSnapshotId: string;
    };
    const manifestPath = `cases/${id}/manifests/${parsed.checkpointSnapshotId}.json`;
    const manifestBytes = files.get(manifestPath);
    if (!manifestBytes) throw new Error("Manifest missing");
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
      divergenceReason: string | null;
    };
    // A structurally accepted provenance change must still invalidate the
    // exact manifest bytes remembered in this session.
    manifest.divergenceReason = "synthetic external change";
    files.set(manifestPath, new TextEncoder().encode(JSON.stringify(manifest)));
  }, caseId);
  await picker.setInputFiles(file);
  await expect(
    page.getByText(
      /Intake did not finish. Some files or records may have been saved/,
    ),
  ).toBeVisible();
  await expect(picker).toBeDisabled();
});

test("rejects an oversized intake-event history", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-INTAKE-EVENT-LIMIT");
  const caseId = await page.getByTestId("current-case-id").textContent();
  if (!caseId) throw new Error("Case ID missing");
  await page.evaluate((id) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    files.set(
      `cases/${id}/intake/events.jsonl`,
      new Uint8Array(16 * 1024 * 1024 + 1),
    );
  }, caseId);
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence."),
  });
  await expect(
    page.getByText(
      /Intake did not finish. Some files or records may have been saved/,
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Add evidence files")).toBeDisabled();
});

test("blocks a changed manifest pointer from the offline built file", async ({
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
    "PBGC-INTAKE-VERIFY-FILE",
    "synthetic-reviewer",
    "Synthetic Reviewer",
    url,
  );
  const caseId = await page.getByTestId("current-case-id").textContent();
  if (!caseId) throw new Error("Case ID missing");
  await page.evaluate((id) => {
    const g = globalThis as unknown as {
      __syntheticReadGate?: (path: string) => Promise<void>;
      __syntheticFiles: Map<string, Uint8Array>;
    };
    g.__syntheticReadGate = (path) => {
      if (path === `cases/${id}/manifests/current.json`) {
        g.__syntheticFiles.set(path, new TextEncoder().encode("invalid"));
        delete g.__syntheticReadGate;
      }
      return Promise.resolve();
    };
  }, caseId);
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence."),
  });
  await expect(
    page.getByText(
      /Intake did not finish. Some files or records may have been saved/,
    ),
  ).toBeVisible();
  expect(requests).toEqual([]);
  expect(outboundRequests).toEqual([]);
});

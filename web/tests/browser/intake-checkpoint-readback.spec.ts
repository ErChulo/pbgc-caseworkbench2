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

for (const target of ["event", "snapshot", "manifest", "pointer"] as const) {
  test(`blocks a ${target} changed during the later review write`, async ({
    offlinePage: page,
  }) => {
    await createSyntheticCase(page, `PBGC-LATE-INTAKE-${target.toUpperCase()}`);
    const caseId = await page.getByTestId("current-case-id").textContent();
    if (!caseId) throw new Error("Case ID missing");
    await page.evaluate(
      ({ id, kind }) => {
        const g = globalThis as unknown as {
          __syntheticWriteGate?: (path: string) => Promise<void>;
          __syntheticFiles: Map<string, Uint8Array>;
          __lateIntakeChange?: boolean;
        };
        g.__syntheticWriteGate = (path) => {
          if (path === `cases/${id}/reviews/current.json`) {
            const files = g.__syntheticFiles;
            const pointerPath = `cases/${id}/manifests/current.json`;
            const pointerBytes = files.get(pointerPath);
            if (!pointerBytes) throw new Error("Intake pointer missing");
            const pointer = JSON.parse(
              new TextDecoder().decode(pointerBytes),
            ) as {
              checkpointSnapshotId: string;
            };
            const targetPath =
              kind === "event"
                ? `cases/${id}/intake/events.jsonl`
                : kind === "pointer"
                  ? pointerPath
                  : `cases/${id}/${kind === "snapshot" ? "snapshots" : "manifests"}/${pointer.checkpointSnapshotId}.json`;
            if (!files.has(targetPath)) throw new Error("Target missing");
            files.set(
              targetPath,
              new TextEncoder().encode("late synthetic change"),
            );
            g.__lateIntakeChange = true;
            delete g.__syntheticWriteGate;
          }
          return Promise.resolve();
        };
      },
      { id: caseId, kind: target },
    );
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
    await expect(page.getByText("File inventory complete")).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          (globalThis as unknown as { __lateIntakeChange?: boolean })
            .__lateIntakeChange,
      ),
    ).toBe(true);
  });
}

for (const fault of ["missing", "mismatch", "oversized"] as const) {
  test(`blocks case restoration with a ${fault} standalone snapshot`, async ({
    offlinePage: page,
  }) => {
    const caseNumber = `PBGC-SNAPSHOT-RESTORE-${fault.toUpperCase()}`;
    await createSyntheticCase(page, caseNumber);
    const picker = page.getByLabel("Add evidence files");
    await picker.setInputFiles({
      name: "synthetic.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic evidence."),
    });
    await expect(page.getByText("File inventory complete")).toBeVisible();
    await expect(picker).toBeEnabled();
    const caseId = await page.getByTestId("current-case-id").textContent();
    if (!caseId) throw new Error("Case ID missing");
    await page
      .getByRole("button", { name: "Return to workspace home" })
      .click();
    const path = await page.evaluate(
      ({ id, kind }) => {
        const files = (
          globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
        ).__syntheticFiles;
        const pointer = files.get(`cases/${id}/manifests/current.json`);
        if (!pointer) throw new Error("Pointer missing");
        const parsed = JSON.parse(new TextDecoder().decode(pointer)) as {
          checkpointSnapshotId: string;
        };
        const path = `cases/${id}/snapshots/${parsed.checkpointSnapshotId}.json`;
        if (!files.has(path)) throw new Error("Snapshot missing before test");
        if (kind === "missing") files.delete(path);
        else if (kind === "oversized")
          files.set(path, new Uint8Array(16 * 1024 * 1024 + 1));
        else files.set(path, new TextEncoder().encode('{"entries":[]}'));
        return path;
      },
      { id: caseId, kind: fault },
    );
    await page.getByRole("button", { name: `Open ${caseNumber}` }).click();
    await expect(
      page.getByText(
        /standalone inventory snapshot is missing or does not match/,
      ),
    ).toBeVisible();
    await expect(picker).toBeDisabled();
    const size = await page.evaluate((snapshotPath) => {
      const files = (
        globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
      ).__syntheticFiles;
      return files.get(snapshotPath)?.byteLength ?? null;
    }, path);
    expect(size).toBe(
      fault === "missing"
        ? null
        : fault === "oversized"
          ? 16 * 1024 * 1024 + 1
          : new TextEncoder().encode('{"entries":[]}').length,
    );
  });
}

for (const fault of [
  "missing",
  "malformed",
  "mismatch",
  "oversized",
] as const) {
  test(`blocks restoration with ${fault} intake event history`, async ({
    offlinePage: page,
  }) => {
    const caseNumber = `PBGC-HISTORY-RESTORE-${fault.toUpperCase()}`;
    await createSyntheticCase(page, caseNumber);
    const picker = page.getByLabel("Add evidence files");
    await picker.setInputFiles({
      name: "synthetic.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic history evidence."),
    });
    await expect(page.getByText("File inventory complete")).toBeVisible();
    await expect(picker).toBeEnabled();
    const caseId = await page.getByTestId("current-case-id").textContent();
    if (!caseId) throw new Error("Case ID missing");
    await page
      .getByRole("button", { name: "Return to workspace home" })
      .click();
    const path = await page.evaluate(
      ({ id, kind }) => {
        const files = (
          globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
        ).__syntheticFiles;
        const path = `cases/${id}/intake/events.jsonl`;
        const bytes = files.get(path);
        if (!bytes) throw new Error("History missing before test");
        if (kind === "missing") files.delete(path);
        else if (kind === "oversized")
          files.set(path, new Uint8Array(16 * 1024 * 1024 + 1));
        else if (kind === "malformed")
          files.set(path, new TextEncoder().encode("invalid\n"));
        else {
          const event = JSON.parse(new TextDecoder().decode(bytes)) as {
            resultingSnapshotId: string;
          };
          event.resultingSnapshotId = "b".repeat(64);
          files.set(
            path,
            new TextEncoder().encode(`${JSON.stringify(event)}\n`),
          );
        }
        return path;
      },
      { id: caseId, kind: fault },
    );
    await page.getByRole("button", { name: `Open ${caseNumber}` }).click();
    await expect(
      page.getByText(/intake event history is missing or does not match/),
    ).toBeVisible();
    await expect(picker).toBeDisabled();
    const exists = await page.evaluate(
      (historyPath) =>
        (
          globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
        ).__syntheticFiles.has(historyPath),
      path,
    );
    expect(exists).toBe(fault !== "missing");
  });
}

test("does not append to a changed intake history in the same session", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-HISTORY-BEFORE-APPEND");
  const picker = page.getByLabel("Add evidence files");
  const file = {
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic history evidence."),
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
    files.set(
      `cases/${id}/intake/events.jsonl`,
      new TextEncoder().encode("invalid\n"),
    );
  }, caseId);
  await picker.setInputFiles(file);
  await expect(
    page.getByText(
      /Intake did not finish. Some files or records may have been saved/,
    ),
  ).toBeVisible();
  await expect(picker).toBeDisabled();
  expect(
    await page.evaluate((id) => {
      const bytes = (
        globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
      ).__syntheticFiles.get(`cases/${id}/intake/events.jsonl`);
      return bytes ? new TextDecoder().decode(bytes) : null;
    }, caseId),
  ).toBe("invalid\n");
});

test("blocks malformed intake history on restoring the offline file", async ({
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
    "PBGC-HISTORY-OFFLINE",
    "synthetic-reviewer",
    "Synthetic Reviewer",
    url,
  );
  const picker = page.getByLabel("Add evidence files");
  await picker.setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic offline evidence."),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await expect(picker).toBeEnabled();
  const caseId = await page.getByTestId("current-case-id").textContent();
  if (!caseId) throw new Error("Case ID missing");
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.evaluate((id) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    files.set(
      `cases/${id}/intake/events.jsonl`,
      new TextEncoder().encode("invalid\n"),
    );
  }, caseId);
  await page.getByRole("button", { name: "Open PBGC-HISTORY-OFFLINE" }).click();
  await expect(
    page.getByText(/intake event history is missing or does not match/),
  ).toBeVisible();
  await expect(picker).toBeDisabled();
  expect(requests).toEqual([]);
  expect(outboundRequests).toEqual([]);
});

for (const restored of [false, true]) {
  test(`blocks valid-looking intake history changes ${restored ? "after restore" : "in the same session"}`, async ({
    offlinePage: page,
  }) => {
    const caseNumber = restored
      ? "PBGC-HISTORY-PIN-RESTORED"
      : "PBGC-HISTORY-PIN-LIVE";
    await createSyntheticCase(page, caseNumber);
    const picker = page.getByLabel("Add evidence files");
    const file = {
      name: "synthetic.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic pinned history."),
    };
    await picker.setInputFiles(file);
    await expect(page.getByText("File inventory complete")).toBeVisible();
    await expect(picker).toBeEnabled();
    const caseId = await page.getByTestId("current-case-id").textContent();
    if (!caseId) throw new Error("Case ID missing");
    if (restored) {
      await page
        .getByRole("button", { name: "Return to workspace home" })
        .click();
      await page.getByRole("button", { name: `Open ${caseNumber}` }).click();
      await expect(
        page.getByText(
          "Evidence restored from this case's persisted manifest.",
        ),
      ).toBeVisible();
      await expect(picker).toBeEnabled();
    }
    const changed = await page.evaluate((id) => {
      const files = (
        globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
      ).__syntheticFiles;
      const path = `cases/${id}/intake/events.jsonl`;
      const bytes = files.get(path);
      if (!bytes) throw new Error("History missing");
      const event = JSON.parse(new TextDecoder().decode(bytes)) as {
        items: unknown[];
      };
      if (!event.items.length) throw new Error("Expected an intake item");
      event.items = [];
      const changed = `${JSON.stringify(event)}\n`;
      files.set(path, new TextEncoder().encode(changed));
      return changed;
    }, caseId);
    await picker.setInputFiles(file);
    await expect(
      page.getByText(
        /Intake did not finish. Some files or records may have been saved/,
      ),
    ).toBeVisible();
    await expect(picker).toBeDisabled();
    const after = await page.evaluate((id) => {
      const bytes = (
        globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
      ).__syntheticFiles.get(`cases/${id}/intake/events.jsonl`);
      return bytes ? new TextDecoder().decode(bytes) : null;
    }, caseId);
    expect(after).toBe(changed);
  });
}

import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

for (const target of [
  "extraction-pointer",
  "extraction-record",
  "correction-pointer",
  "correction-record",
] as const) {
  test(`does not display oversized ${target}`, async ({
    offlinePage: page,
  }) => {
    await createSyntheticCase(page, `PBGC-TEXT-${target}`);
    const id = await page.getByTestId("current-case-id").textContent();
    if (!id) throw new Error("Synthetic case ID missing");
    await page.getByLabel("Add evidence files").setInputFiles({
      name: "synthetic.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic original."),
    });
    await expect(page.getByText("File inventory complete")).toBeVisible();
    const row = page
      .getByRole("table", { name: "Provisional artifact inventory" })
      .getByRole("row", { name: /synthetic.txt/u });
    if (target.startsWith("correction")) {
      await row.getByRole("button", { name: /Open evidence/u }).click();
      await page
        .getByLabel("Human-corrected text")
        .fill("Synthetic correction.");
      await page.getByRole("button", { name: "Save corrected text" }).click();
      await expect(
        page.getByText(/Corrected text saved separately/),
      ).toBeVisible();
      await page.getByRole("button", { name: "Close viewer" }).click();
    }
    await page.evaluate(
      ({ caseId, kind }) => {
        const files = (
          globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
        ).__syntheticFiles;
        const family = kind.startsWith("correction")
          ? "corrections"
          : "extractions";
        const prefix = `cases/${caseId}/${family}/`;
        const pointer = [...files.keys()].find(
          (path) => path.startsWith(prefix) && path.endsWith("/current.json"),
        );
        if (!pointer) throw new Error("Synthetic pointer missing");
        let path = pointer;
        if (kind.endsWith("record")) {
          const value = JSON.parse(
            new TextDecoder().decode(files.get(pointer)),
          ) as {
            extractionContentSha256?: string;
            correctionContentSha256?: string;
          };
          const hash =
            value.extractionContentSha256 ?? value.correctionContentSha256;
          if (!hash) throw new Error("Synthetic pointer hash missing");
          path = `${pointer.slice(0, -"current.json".length)}${hash}.json`;
        }
        if (!files.has(path)) throw new Error("Synthetic record missing");
        files.set(
          path,
          new Uint8Array(
            kind.endsWith("pointer") ? 64 * 1024 + 1 : 64 * 1024 * 1024 + 1,
          ).fill(32),
        );
      },
      { caseId: id, kind: target },
    );
    await row.getByRole("button", { name: /Open evidence/u }).click();
    await expect(
      page.getByText(
        /original is verified, but its extraction or correction state could not be verified/,
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Human-corrected text")).toHaveCount(0);
  });
}

for (const family of ["extractions", "corrections"] as const) {
  test(`does not publish ${family} pointer if a new record fails readback`, async ({
    offlinePage: page,
  }) => {
    await createSyntheticCase(page, `PBGC-READBACK-${family}`);
    const id = await page.getByTestId("current-case-id").textContent();
    if (!id) throw new Error("Synthetic case ID missing");
    if (family === "corrections") {
      await page.getByLabel("Add evidence files").setInputFiles({
        name: "synthetic.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Synthetic original."),
      });
      await expect(page.getByText("File inventory complete")).toBeVisible();
      await page
        .getByRole("table", { name: "Provisional artifact inventory" })
        .getByRole("row", { name: /synthetic.txt/u })
        .getByRole("button", { name: /Open evidence/u })
        .click();
      await page
        .getByLabel("Human-corrected text")
        .fill("Synthetic correction.");
    }
    await page.evaluate(
      ({ caseId, familyName }) => {
        const g = globalThis as unknown as {
          __syntheticReadGate?: (path: string) => Promise<void>;
          __syntheticFiles: Map<string, Uint8Array>;
        };
        g.__syntheticReadGate = (path) => {
          if (
            path.startsWith(`cases/${caseId}/${familyName}/`) &&
            !path.endsWith("/current.json")
          ) {
            const bytes = g.__syntheticFiles.get(path);
            if (!bytes) throw new Error("Synthetic text record missing");
            const altered = Uint8Array.from(bytes);
            altered[0] = (altered[0] ?? 0) ^ 1;
            g.__syntheticFiles.set(path, altered);
            g.__syntheticReadGate = undefined;
          }
          return Promise.resolve();
        };
      },
      { caseId: id, familyName: family },
    );
    if (family === "extractions") {
      await page.getByLabel("Add evidence files").setInputFiles({
        name: "synthetic.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Synthetic original."),
      });
      await expect(
        page.getByText(
          /Intake did not finish. Some files or records may have been saved/,
        ),
      ).toBeVisible();
      await expect(page.getByLabel("Add evidence files")).toBeDisabled();
    } else {
      await page.getByRole("button", { name: "Save corrected text" }).click();
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "failed post-write verification" }),
      ).toBeVisible();
    }
    const pointerPublished = await page.evaluate(
      ({ caseId, familyName }) => {
        const files = (
          globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
        ).__syntheticFiles;
        return [...files.keys()].some(
          (path) =>
            path.startsWith(`cases/${caseId}/${familyName}/`) &&
            path.endsWith("/current.json"),
        );
      },
      { caseId: id, familyName: family },
    );
    expect(pointerPublished).toBe(false);
  });
}

test("blocks oversized extraction pointers from the built file without HTTP", async ({
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
    "PBGC-TEXT-FILE",
    "synthetic-reviewer",
    "Synthetic Reviewer",
    url,
  );
  const id = await page.getByTestId("current-case-id").textContent();
  if (!id) throw new Error("Synthetic case ID missing");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic original."),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await page.evaluate((caseId) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const pointer = [...files.keys()].find(
      (path) =>
        path.startsWith(`cases/${caseId}/extractions/`) &&
        path.endsWith("/current.json"),
    );
    if (!pointer) throw new Error("Synthetic pointer missing");
    files.set(pointer, new Uint8Array(64 * 1024 + 1));
  }, id);
  await page
    .getByRole("table", { name: "Provisional artifact inventory" })
    .getByRole("row", { name: /synthetic.txt/u })
    .getByRole("button", { name: /Open evidence/u })
    .click();
  await expect(
    page.getByText(
      /original is verified, but its extraction or correction state could not be verified/,
    ),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
  expect(requests).toEqual([]);
});

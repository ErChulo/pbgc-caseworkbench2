import { createHash } from "node:crypto";
import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

test("does not publish intake analysis when preserved bytes change after the write check", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-INTAKE-BYTE-BINDING");
  const source = Buffer.from("Synthetic plan text before alteration.");
  const hash = createHash("sha256").update(source).digest("hex");
  await page.evaluate((sha) => {
    const globals = globalThis as unknown as {
      __syntheticFiles: Map<string, Uint8Array>;
      __syntheticReadGate?: (path: string) => Promise<void>;
    };
    const target = `objects/sha256/${sha.slice(0, 2)}/${sha}`;
    let reads = 0;
    globals.__syntheticReadGate = (path) => {
      if (path === target && ++reads === 2) {
        const bytes = globals.__syntheticFiles.get(path);
        if (!bytes) throw new Error("Synthetic object missing");
        const altered = Uint8Array.from(bytes);
        altered[0] = (altered[0] ?? 0) ^ 1;
        globals.__syntheticFiles.set(path, altered);
      }
      return Promise.resolve();
    };
  }, hash);
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "tampered.txt",
    mimeType: "text/plain",
    buffer: source,
  });
  await expect(page.getByText("File inventory partial")).toBeVisible();
  await expect(
    page.getByText(/Preserved evidence bytes changed before inspection/),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "Provisional artifact inventory" })
      .getByRole("row", { name: /tampered.txt/ }),
  ).toContainText("failed");
  const extractionPaths = await page.evaluate(
    (sha) =>
      [
        ...(
          globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
        ).__syntheticFiles.keys(),
      ].filter((path) => path.includes(`/extractions/${sha}/`)),
    hash,
  );
  expect(extractionPaths).toEqual([]);
  expect(outboundRequests).toEqual([]);
});

test("reports an oversized selection as partial without preserving or inspecting it", async ({
  offlinePage: page,
}) => {
  await createSyntheticCase(page, "PBGC-INTAKE-SIZE-LIMIT");
  const bytes = Buffer.alloc(32 * 1024 * 1024 + 1, 65);
  const hash = createHash("sha256").update(bytes).digest("hex");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "synthetic-large.txt",
    mimeType: "text/plain",
    buffer: bytes,
  });
  await expect(page.getByText("File inventory partial")).toBeVisible();
  await expect(
    page.getByText(/File exceeds the 32 MiB local inspection limit/),
  ).toBeVisible();
  const objects = await page.evaluate(() =>
    [
      ...(
        globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
      ).__syntheticFiles.keys(),
    ].filter((path) => path.startsWith("objects/sha256/")),
  );
  expect(objects).not.toContain(`objects/sha256/${hash.slice(0, 2)}/${hash}`);
});

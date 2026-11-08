import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "./fixtures";

for (const mode of ["development", "file"] as const) {
  test(`uses only the exact approved local Data Dictionary (${mode})`, async ({
    offlinePage: page,
    outboundRequests,
  }) => {
    const inputPath = process.env.PBGC_DATA_DICTIONARY_PATH;
    test.skip(
      !inputPath,
      "Set PBGC_DATA_DICTIONARY_PATH to the authorized, hash-pinned workbook.",
    );
    if (!inputPath) return;
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
    await page.goto(url);
    const panel = page.getByRole("region", {
      name: "Approved Data Dictionary lookup",
    });
    const picker = panel.getByLabel("Select approved Data Dictionary");
    const approved = await readFile(resolve(inputPath));
    const altered = Buffer.from(approved);
    altered[altered.length - 1] = (altered[altered.length - 1] ?? 0) ^ 1;
    await picker.setInputFiles({
      name: "altered.xlsm",
      mimeType: "application/octet-stream",
      buffer: altered,
    });
    await expect(
      panel.getByText(/bytes do not match the approved SHA-256/),
    ).toBeVisible();
    await expect(panel.getByLabel("Field name")).toHaveCount(0);
    await picker.setInputFiles({
      name: "approved.xlsm",
      mimeType: "application/octet-stream",
      buffer: approved,
    });
    await expect(panel.getByText(/1,?172 field records/)).toBeVisible();
    await expect(panel.getByText(/No macros were executed/)).toBeVisible();
    await panel.getByLabel("Field name").fill("CUSTOMER_DELETE_FLAG");
    await expect(panel.getByText(/Ambiguous field name/)).toBeVisible();
    await expect(panel.getByText(/11 matching record/)).toBeVisible();
    const first = await panel.locator("li strong").first().textContent();
    if (!first)
      throw new Error("Expected a table-qualified synthetic lookup result");
    const table = first.split(" / ")[0];
    if (!table) throw new Error("Expected a table name");
    await panel.getByLabel("Table name (optional)").fill(table);
    await expect(
      panel.getByText("1 matching record(s).", { exact: true }),
    ).toBeVisible();
    await panel.getByLabel("Field name").fill("customer_delete_flag");
    await expect(
      panel.getByText("0 matching record(s).", { exact: true }),
    ).toBeVisible();
    expect(outboundRequests).toEqual([]);
    expect(requests).toEqual([]);
  });
}

test("a delayed earlier selection cannot replace a later rejected dictionary", async ({
  offlinePage: page,
}) => {
  const inputPath = process.env.PBGC_DATA_DICTIONARY_PATH;
  test.skip(
    !inputPath,
    "Set PBGC_DATA_DICTIONARY_PATH to the authorized, hash-pinned workbook.",
  );
  if (!inputPath) return;
  await page.goto("/");
  await page.evaluate(() => {
    const g = globalThis as unknown as {
      __dictionaryEntered?: boolean;
      __releaseDictionary?: () => void;
    };
    // Save the original method and invoke it with the selected file as receiver.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === "slow.xlsm") {
        g.__dictionaryEntered = true;
        await new Promise<void>((done) => {
          g.__releaseDictionary = done;
        });
      }
      return original.call(this);
    };
  });
  const panel = page.getByRole("region", {
    name: "Approved Data Dictionary lookup",
  });
  const picker = panel.getByLabel("Select approved Data Dictionary");
  const approved = await readFile(resolve(inputPath));
  await picker.setInputFiles({
    name: "slow.xlsm",
    mimeType: "application/octet-stream",
    buffer: approved,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __dictionaryEntered?: boolean })
            .__dictionaryEntered,
      ),
    )
    .toBe(true);
  await picker.setInputFiles({
    name: "invalid.xlsm",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not a workbook"),
  });
  await expect(
    panel.getByText(/does not have the approved Data Dictionary size/),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      globalThis as unknown as { __releaseDictionary?: () => void }
    ).__releaseDictionary?.(),
  );
  await expect(panel.getByLabel("Field name")).toHaveCount(0);
  await expect(
    panel.getByText(/approved Data Dictionary verified locally/),
  ).toHaveCount(0);
});

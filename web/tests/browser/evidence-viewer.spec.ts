import { expect, test } from "./fixtures";
import { pdfJsFixture } from "../fixtures/generators/passive-formats";
import { createSyntheticCase } from "./synthetic-workspace";

const inventoryRow = (
  page: import("@playwright/test").Page,
  filename: string,
) =>
  page
    .getByRole("table", { name: "Provisional artifact inventory" })
    .getByRole("row", { name: new RegExp(filename, "u") });

test("opens verified text evidence beside its persisted machine extraction", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-VIEW-TEXT");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "viewer-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic viewer text"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await inventoryRow(page, "viewer-note.txt")
    .getByRole("button", { name: /Open evidence/u })
    .click();
  await expect(
    page.getByRole("heading", { name: "Evidence viewer" }),
  ).toBeVisible();
  const panes = page.locator(".evidence-viewer-pane");
  await expect(panes.nth(0).getByText("Synthetic viewer text")).toBeVisible();
  await expect(
    panes.nth(1).locator("pre").getByText("Synthetic viewer text"),
  ).toBeVisible();
  await expect(page.getByText("Verified SHA-256")).toBeVisible();
  await page
    .getByLabel("Human-corrected text")
    .fill(
      "First Amendment. The plan is hereby amended effective July 31, 2020.",
    );
  await page.getByRole("button", { name: "Save corrected text" }).click();
  await expect(
    page.getByText(
      "Corrected text saved separately and is now the source for provisional classification and date analysis. The original machine extraction remains unchanged.",
    ),
  ).toBeVisible();
  const classification = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Classification review" }),
  });
  await expect(
    classification.getByText("amendment", { exact: true }),
  ).toHaveCount(2);
  await expect(
    classification.getByText("2020-07-31", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close viewer" }).click();
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByRole("button", { name: "Open PBGC-VIEW-TEXT" }).click();
  await expect(
    page.getByText("Evidence restored from this case's persisted manifest."),
  ).toBeVisible();
  await inventoryRow(page, "viewer-note.txt")
    .getByRole("button", { name: /Open evidence/u })
    .click();
  await expect(
    panes.nth(1).locator("pre").getByText("Synthetic viewer text"),
  ).toBeVisible();
  await expect(page.getByLabel("Human-corrected text")).toHaveValue(
    "First Amendment. The plan is hereby amended effective July 31, 2020.",
  );
  await expect(
    classification.getByText("amendment", { exact: true }),
  ).toHaveCount(2);
  expect(outboundRequests).toEqual([]);
});

test("rejects a correction that introduces unreviewed sensitive-data findings", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-VIEW-CORRECTION-PII");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "safe-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic safe note"),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await inventoryRow(page, "safe-note.txt")
    .getByRole("button", { name: /Open evidence/u })
    .click();
  await page
    .getByLabel("Human-corrected text")
    .fill("Contact synthetic.person@example.test");
  await page.getByRole("button", { name: "Save corrected text" }).click();
  await expect(
    page.getByText(
      "Corrected text was not saved because it introduced sensitive-data findings that are not covered by an effective same-artifact release.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close viewer" }).click();
  await inventoryRow(page, "safe-note.txt")
    .getByRole("button", { name: /Open evidence/u })
    .click();
  await expect(page.getByLabel("Human-corrected text")).toHaveValue(
    "Synthetic safe note",
  );
  expect(outboundRequests).toEqual([]);
});

test("renders a PDF locally and shows page-bound machine text", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-VIEW-PDF");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "viewer-plan.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      pdfJsFixture(
        "Synthetic plan evidence contact synthetic.person@example.test",
      ),
    ),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await inventoryRow(page, "viewer-plan.pdf")
    .getByRole("button", { name: /Open evidence/u })
    .click();
  const canvas = page.getByRole("img", {
    name: "PDF preview of viewer-plan.pdf",
  });
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate((element) => (element as HTMLCanvasElement).width),
    )
    .toBeGreaterThan(0);
  const extractionText = page
    .locator(".evidence-viewer-pane")
    .nth(1)
    .locator("pre");
  await expect(extractionText).toContainText("[Page 1]");
  await expect(extractionText).toContainText("Synthetic plan evidence");
  await expect(extractionText).toContainText("synthetic.person@example.test");
  await expect(
    page.getByRole("heading", { name: "Quarantine queue" }),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

test("renders a recognized raster image without claiming OCR", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-VIEW-IMAGE");
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "viewer-image.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  await inventoryRow(page, "viewer-image.png")
    .getByRole("button", { name: /Open evidence/u })
    .click();
  const canvas = page.getByRole("img", {
    name: "Image preview of viewer-image.png",
  });
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate((element) => (element as HTMLCanvasElement).width),
    )
    .toBeGreaterThan(0);
  await expect(page.getByText("No machine text was found.")).toBeVisible();
  await expect(page.getByText(/OCR was not performed/u)).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

test("proposes both artifact and exact-page classifications for a machine-readable PDF", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-CLASSIFY-PDF-PAGE");
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "page-classification.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdfJsFixture("Executed defined benefit plan document")),
  });
  await expect(page.getByText("File inventory complete")).toBeVisible();
  const classification = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Classification review" }),
  });
  await expect(
    classification.getByText("Whole artifact").first(),
  ).toBeVisible();
  await expect(classification.getByText("PDF page 1").first()).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

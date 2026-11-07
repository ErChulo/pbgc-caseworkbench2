import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

test("creates and downloads a blocked provisional preview without releasing the package", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-SECTION-436-PREVIEW-001");
  const caseId =
    (await page.getByTestId("current-case-id").textContent()) ?? "";
  const panel = page.getByRole("region", {
    name: "Create a provisional Section 436 preview",
  });
  await expect(
    panel.getByText(/Review labels in the file are assertions/),
  ).toBeVisible();
  const templateEvent = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Download empty input template" })
    .click();
  const template = await templateEvent;
  const templatePath = await template.path();
  if (!templatePath) throw new Error("No template download");
  const inputBytes = await readFile(templatePath);
  expect(JSON.parse(inputBytes.toString("utf8"))).toEqual({
    caseId,
    facts: [],
    rules: [],
  });
  await panel.getByLabel(/Preview input JSON file/).setInputFiles({
    name: "input.json",
    mimeType: "application/json",
    buffer: inputBytes,
  });
  await panel
    .getByRole("button", { name: "Create provisional preview" })
    .click();
  await expect(
    panel.getByText(/Provisional evaluation status: blocked/),
  ).toBeVisible();
  const sourceHash = createHash("sha256").update(inputBytes).digest("hex");
  await expect(panel.getByText(/Input file SHA-256:/)).toContainText(
    sourceHash,
  );
  const previewEvent = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Download provisional preview" })
    .click();
  const preview = await previewEvent;
  const previewPath = await preview.path();
  if (!previewPath) throw new Error("No preview download");
  expect(preview.suggestedFilename()).toBe(
    `provisional-section-436-preview-${caseId}.json`,
  );
  const previewBytes = await readFile(previewPath);
  const result = JSON.parse(previewBytes.toString("utf8")) as {
    kind: string;
    sourceFileSha256: string;
    evaluation: { deterministicPayload: { evaluationStatus: string } };
  };
  expect(result.kind).toBe("provisional-section-436-preview");
  expect(result.sourceFileSha256).toBe(sourceHash);
  expect(result.evaluation.deterministicPayload.evaluationStatus).toBe(
    "blocked",
  );
  await expect(panel.getByText(/Preview file SHA-256:/)).toContainText(
    createHash("sha256").update(previewBytes).digest("hex"),
  );
  const verification = page.getByRole("region", {
    name: "Check a provisional Section 436 preview",
  });
  await verification.getByLabel(/Provisional preview JSON file/).setInputFiles({
    name: "preview.json",
    mimeType: "application/json",
    buffer: previewBytes,
  });
  await verification
    .getByLabel(/Original preview input JSON file/)
    .setInputFiles({
      name: "source.json",
      mimeType: "application/json",
      buffer: inputBytes,
    });
  await verification
    .getByRole("button", { name: "Check preview and input" })
    .click();
  await expect(
    verification.getByText(
      /Local regeneration matched. Evaluation status: blocked/,
    ),
  ).toBeVisible();
  await verification
    .getByLabel(/Original preview input JSON file/)
    .setInputFiles({
      name: "changed.json",
      mimeType: "application/json",
      buffer: Buffer.from("{}"),
    });
  await expect(
    verification.getByText(/Local regeneration matched/),
  ).not.toBeVisible();
  await verification
    .getByRole("button", { name: "Check preview and input" })
    .click();
  await expect(verification.getByRole("alert")).toContainText(
    "input file hash does not match",
  );
  await expect(
    page
      .locator("li.case-output-stage")
      .filter({ hasText: "Section 436 evaluation" }),
  ).toContainText("Required · blocked");
  expect(outboundRequests).toEqual([]);
});

test("creates a provisional preview in the built file URL with network blocked", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  const { installSyntheticWorkspace } = await import("./synthetic-workspace");
  const { resolve } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  await page.route(/^https?:/u, (route) => route.abort());
  await installSyntheticWorkspace(page);
  await page.goto(pathToFileURL(resolve("dist/pbgc-caseworkbench.html")).href);
  await page.getByRole("button", { name: "Select local workspace" }).click();
  await page.getByLabel("Reviewer identifier").fill("synthetic-reviewer");
  await page.getByLabel("Reviewer display name").fill("Synthetic Reviewer");
  await page.getByRole("button", { name: "Establish identity" }).click();
  await page.getByLabel("Case number").fill("PBGC-SECTION-436-FILE-001");
  await page.getByRole("button", { name: "Create production case" }).click();
  const caseId =
    (await page.getByTestId("current-case-id").textContent()) ?? "";
  const panel = page.getByRole("region", {
    name: "Create a provisional Section 436 preview",
  });
  const inputBytes = Buffer.from(
    JSON.stringify({ caseId, facts: [], rules: [] }),
  );
  await panel.getByLabel(/Preview input JSON file/).setInputFiles({
    name: "synthetic.json",
    mimeType: "application/json",
    buffer: inputBytes,
  });
  await panel
    .getByRole("button", { name: "Create provisional preview" })
    .click();
  await expect(
    panel.getByText(/Provisional evaluation status: blocked/),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Download provisional preview" }),
  ).toBeEnabled();
  const downloadEvent = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Download provisional preview" })
    .click();
  const download = await downloadEvent;
  const path = await download.path();
  if (!path) throw new Error("No preview download");
  const verification = page.getByRole("region", {
    name: "Check a provisional Section 436 preview",
  });
  await verification.getByLabel(/Provisional preview JSON file/).setInputFiles({
    name: "preview.json",
    mimeType: "application/json",
    buffer: await readFile(path),
  });
  await verification
    .getByLabel(/Original preview input JSON file/)
    .setInputFiles({
      name: "source.json",
      mimeType: "application/json",
      buffer: inputBytes,
    });
  await verification
    .getByRole("button", { name: "Check preview and input" })
    .click();
  await expect(
    verification.getByText(
      /Local regeneration matched. Evaluation status: blocked/,
    ),
  ).toBeVisible();
  await verification
    .getByRole("button", { name: "Prepare provisional review memo" })
    .click();
  const memoButton = verification.getByRole("button", {
    name: "Download provisional review memo",
  });
  await expect(memoButton).toBeEnabled();
  const memoEvent = page.waitForEvent("download");
  await memoButton.click();
  const memo = await memoEvent;
  expect(memo.suggestedFilename()).toBe(
    `provisional-section-436-review-${caseId}.txt`,
  );
  const memoPath = await memo.path();
  if (!memoPath) throw new Error("No memo download");
  const memoBytes = await readFile(memoPath);
  expect(memoBytes.toString("utf8")).toContain(
    "PROVISIONAL SECTION 436 REVIEW MEMO — NOT APPROVED CASEWORK",
  );
  expect(memoBytes.toString("utf8")).toContain(
    "Evaluation status: blocked (provisional)",
  );
  await expect(verification.getByText(/Memo file SHA-256:/)).toContainText(
    createHash("sha256").update(memoBytes).digest("hex"),
  );
  await expect(
    page
      .locator("li.case-output-stage")
      .filter({ hasText: "Section 436 evaluation" }),
  ).toContainText("Required · blocked");
  expect(outboundRequests).toEqual([]);
});

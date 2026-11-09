import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as XLSX from "xlsx";
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

const PLAN_TEXT =
  "Executed Defined Benefit Plan Document. Effective 2020-01-01.";

function populationWorkbook(): Uint8Array {
  // The Retirees tab pattern requires DOB, NRD, BSEX, COMP, and FV
  // (rules/tab-selection.yaml). FV is O-classified and CALC_INDICATOR is
  // B-classified by rules/iob-classification.yaml, so the governed BuildSpec
  // demands an approved formula for each: the FV column carries a real
  // formula and the CALC_INDICATOR column carries a context-flag constant,
  // both approved through Formula Governance before the rebuild.
  const workbook = XLSX.utils.book_new();
  const retirees = XLSX.utils.aoa_to_sheet([
    ["DOB", "NRD", "BSEX", "COMP", "FV", "CALC_INDICATOR"],
    ["1960-05-12", "2025-05-01", "M", 42000, null, null],
  ]);
  // aoa_to_sheet keeps "=" strings as text, so write the formulas as
  // explicit formula cells. Leaving the cached result absent (or empty for
  // the string constant) means the passive parser records only the formula
  // text (no stored-value "example" segment), so candidate extraction emits
  // no blocking unresolved item. The reference targets D1 (the COMP header
  // cell) because only header and formula cells are included in the governed
  // architecture; plain value cells are not.
  retirees.E2 = { t: "n", f: "D1*0.05" };
  retirees.F2 = { t: "s", f: '"V"', v: "" };
  XLSX.utils.book_append_sheet(workbook, retirees, "Retirees");
  return new Uint8Array(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  );
}

async function approveSharedPanel(
  page: import("@playwright/test").Page,
  heading: string,
  reviewer: string,
  rationale: string,
) {
  const panel = page.locator("section").filter({
    has: page.getByRole("heading", { name: heading }),
  });
  await panel.getByLabel("Reviewer name").fill(reviewer);
  await panel.getByLabel("Rationale").fill(rationale);
  return panel;
}

async function exercisePipeline(
  {
    offlinePage: page,
    outboundRequests,
  }: { offlinePage: Page; outboundRequests: string[] },
  mode: "development" | "file",
) {
  test.setTimeout(120_000);
  const httpRequests: string[] = [];
  if (mode === "file") {
    page.on("request", (request) => {
      if (/^https?:/u.test(request.url())) httpRequests.push(request.url());
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
    "PBGC-V1-PRODUCTION-001",
    "synthetic-reviewer",
    "Synthetic Reviewer",
    url,
  );
  const oraclePanel = page.getByRole("region", {
    name: "Provisional oracle evidence",
  });
  await expect(
    oraclePanel.getByText(/Generate the current V1 workbook/),
  ).toBeVisible();
  await expect(oraclePanel.getByLabel("Local oracle input")).toBeDisabled();
  await expect(
    oraclePanel.getByLabel("Saved proposal SHA-256 hash"),
  ).toBeEnabled();
  await oraclePanel
    .getByRole("button", { name: "Find saved proposal names" })
    .click();
  await expect(
    oraclePanel.getByText("No saved proposal names found."),
  ).toBeVisible();
  const candidateHash = "a".repeat(64);
  await page.evaluate(async (hash) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const path = [...files.keys()].find((item) =>
      /^cases\/[^/]+\/case\.json$/u.test(item),
    );
    if (!path) throw new Error("Synthetic case not found");
    const caseId = path.split("/")[1];
    if (!caseId) throw new Error("Synthetic case ID missing");
    const root = await (
      globalThis as unknown as {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker();
    let current = root;
    for (const name of ["cases", caseId, "evidence", "provisional-oracles"])
      current = await current.getDirectoryHandle(name, { create: true });
    await current.getDirectoryHandle(hash, { create: true });
    await current.getDirectoryHandle("unexpected", { create: true });
  }, candidateHash);
  await oraclePanel
    .getByRole("button", { name: "Find saved proposal names" })
    .click();
  await expect(
    oraclePanel.getByText(/Unexpected entries not listed: 1/),
  ).toBeVisible();
  await oraclePanel
    .getByRole("button", { name: `Select ${candidateHash}` })
    .click();
  await expect(
    oraclePanel.getByLabel("Saved proposal SHA-256 hash"),
  ).toHaveValue(candidateHash);
  await expect(
    oraclePanel.getByRole("button", { name: "Open saved proposal" }),
  ).toBeDisabled();
  await oraclePanel.getByText("View interchange requirements").click();
  await expect(oraclePanel.getByText(/JSON: an object with a/)).toBeVisible();
  await expect(
    oraclePanel.getByRole("button", { name: "Save provisional evidence" }),
  ).toBeDisabled();

  const workbookBytes = populationWorkbook();
  const workbookHash = createHash("sha256").update(workbookBytes).digest("hex");
  await page.getByLabel("Add evidence files").setInputFiles([
    {
      name: "plan-document.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(PLAN_TEXT),
    },
    {
      // The workbook passive parser emits no text, so the deterministic
      // classifier maps this artifact by its submitted filename to the
      // certified-case-report source role. The octet-stream declaration avoids
      // a media-signature mismatch for formats without a registered mapping.
      name: "Certified Case Report.xlsx",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(workbookBytes),
    },
  ]);
  await expect(page.getByText("File inventory complete")).toBeVisible();

  // 1. Eligibility: approve the two case artifacts and the four preserved
  // rule-source YAMLs so the evidence catalog can be released.
  const eligibility = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Artifact eligibility review" }),
  });
  await eligibility.getByLabel("Reviewer name").fill("governed-reviewer");
  await eligibility
    .getByLabel("Rationale")
    .fill("Exact preserved bytes and screening result reviewed.");
  await expect(eligibility.locator("li")).toHaveCount(6);
  for (const item of await eligibility.locator("li").all()) {
    const approve = item.getByRole("button", { name: /Approve/u });
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(item.getByText("Eligible", { exact: true })).toBeVisible();
  }

  // 2. Classification: approve the source-role proposals for both artifacts.
  const classification = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Classification review" }),
  });
  await classification.getByLabel("Reviewer name").fill("governed-reviewer");
  await classification
    .getByLabel("Rationale")
    .fill("Deterministic source-role classification reviewed.");
  const sourceRoles = classification.locator(".review-list > li").filter({
    hasText: "source-role",
  });
  await expect(sourceRoles).toHaveCount(2);
  for (const item of await sourceRoles.all()) {
    await item.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(item.getByText("Approved", { exact: true })).toBeVisible();
  }

  // 3. Rule authoring for the active case: author the plan-rule combination
  // that satisfies the NRD scenario trigger conditions.
  await page
    .getByRole("button", { name: "Rule authoring", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Plan rule author" }),
  ).toBeVisible();
  await expect(
    page.getByText("Case-derived candidates", { exact: true }),
  ).toBeVisible();

  const candidatesFieldset = page
    .locator("fieldset")
    .filter({ hasText: "Select provision candidates" });
  const preselected = candidatesFieldset.locator(
    "input[type='checkbox']:checked",
  );
  if ((await preselected.count()) > 0) {
    await preselected.first().uncheck();
  }
  const planCandidate = candidatesFieldset
    .locator("label")
    .filter({ hasText: "Provision text-line-1, effective 2020-01-01" });
  await planCandidate.locator("input[type='checkbox']").check();
  await page.getByLabel("Effective date", { exact: true }).fill("2020-01-01");
  // The restatement textarea initializes from the first workbook-cell
  // candidate, whose value is appended to the label's accessible name, so
  // target the control by id instead of by exact label text.
  await page
    .locator("#governing-restatement")
    .fill("Executed Defined Benefit Plan Document.");
  await page
    .getByRole("region", { name: "Plan rule author" })
    .getByLabel("Reviewer name", { exact: true })
    .fill("architect-reviewer");
  await page
    .getByLabel("Approval rationale", { exact: true })
    .fill("E2E authored retirement-benefit rule.");

  const submitRule = page.getByRole("button", {
    name: "Validate rule preview",
  });
  // The scenario-specific dimension is not in the approved plan-rule schema.
  // Verify it is blocked before persistence, then use a supported dimension.
  const dimension = page.getByLabel("Dimension");
  const unsupported = dimension.locator(
    'option[value="early-retirement-provision"]',
  );
  await expect(unsupported).toHaveAttribute("disabled", "");
  await page.getByLabel("Condition value").fill("all synthetic participants");
  await expect(submitRule).toBeEnabled();
  const planHash = createHash("sha256").update(PLAN_TEXT).digest("hex");
  await page.evaluate((sha) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const path = `objects/sha256/${sha.slice(0, 2)}/${sha}`;
    const value = files.get(path);
    if (!value) throw new Error("Synthetic plan object not found");
    const changed = Uint8Array.from(value);
    changed[0] = (changed[0] ?? 0) ^ 1;
    files.set(path, changed);
  }, planHash);
  await submitRule.click();
  await expect(
    page.getByRole("alert").filter({
      hasText:
        "Rule source verification blocked: The preserved source bytes do not match",
    }),
  ).toBeVisible();
  await page.evaluate(
    ({ sha, text }) => {
      const files = (
        globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
      ).__syntheticFiles;
      files.set(
        `objects/sha256/${sha.slice(0, 2)}/${sha}`,
        new TextEncoder().encode(text),
      );
    },
    { sha: planHash, text: PLAN_TEXT },
  );
  // Manipulating the option cannot enable the submit action either.
  await unsupported.evaluate((option) => {
    (option as HTMLOptionElement).disabled = false;
  });
  await dimension.selectOption("early-retirement-provision");
  await expect(submitRule).toBeDisabled();
  const savedBeforeValidRule = await page.evaluate(() => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    return [...files.keys()].some((path) =>
      path.endsWith("rule-records.jsonl"),
    );
  });
  expect(savedBeforeValidRule).toBe(false);
  await page
    .getByLabel("Dimension")
    .selectOption({ label: "Participant group" });
  await page.getByLabel("Condition value").fill("all synthetic participants");
  await submitRule.click();
  await expect(submitRule).toBeEnabled();
  await expect(
    page.getByText(
      /Governed validation passed and the plan-rule record was persisted locally/,
    ),
  ).toBeVisible();

  // Reopen the same case and verify the saved rule is restored only after
  // history, current review and source reinspection.
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page
    .getByRole("button", { name: "Open PBGC-V1-PRODUCTION-001" })
    .click();
  await page
    .getByRole("button", { name: "Rule authoring", exact: true })
    .click();
  await expect(
    page.getByLabel("Supersession predecessor").locator("option"),
  ).toHaveCount(2);

  // A missing review event makes the local rule history unusable.
  const savedEvents = await page.evaluate(() => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const item = [...files.entries()].find(([path]) =>
      path.endsWith("/reviews/events.jsonl"),
    );
    if (!item) throw new Error("Review history not found");
    const [path, bytes] = item;
    const original = Array.from(bytes);
    const lines = new TextDecoder()
      .decode(bytes)
      .split("\n")
      .filter((line) => !line.includes('"plan-rule-recorded"'));
    files.set(path, new TextEncoder().encode(lines.join("\n")));
    return { path, original };
  });
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page
    .getByRole("button", { name: "Open PBGC-V1-PRODUCTION-001" })
    .click();
  await page
    .getByRole("button", { name: "Rule authoring", exact: true })
    .click();
  await expect(
    page.getByText("A saved plan-rule record is missing its review event."),
  ).toBeVisible();
  await expect(
    page.getByLabel("Supersession predecessor").locator("option"),
  ).toHaveCount(1);
  await page.evaluate(({ path, original }) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    files.set(path, new Uint8Array(original));
  }, savedEvents);
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page
    .getByRole("button", { name: "Open PBGC-V1-PRODUCTION-001" })
    .click();
  await page
    .getByRole("button", { name: "Rule authoring", exact: true })
    .click();
  await expect(
    page.getByLabel("Supersession predecessor").locator("option"),
  ).toHaveCount(2);

  // 4. Population: approve the workbook-derived population candidate.
  const population = await approveSharedPanel(
    page,
    "Population candidate review",
    "governed-reviewer",
    "Synthetic population workbook reviewed locally.",
  );
  const populationCandidate = population.locator("li").first();
  // Approval must verify the preserved source, not only the displayed profile.
  await page.evaluate((sha) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const path = `objects/sha256/${sha.slice(0, 2)}/${sha}`;
    const value = files.get(path);
    if (!value) throw new Error("Synthetic workbook object not found");
    const altered = Uint8Array.from(value);
    altered[0] = (altered[0] ?? 0) ^ 1;
    files.set(path, altered);
  }, workbookHash);
  await populationCandidate.getByRole("button", { name: "Approve" }).click();
  await expect(population.getByRole("alert")).toContainText(
    "Population approval blocked: The workbook bytes do not match",
  );
  await expect(
    populationCandidate.getByText("Approved", { exact: true }),
  ).not.toBeVisible();
  await page.evaluate((sha) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const path = `objects/sha256/${sha.slice(0, 2)}/${sha}`;
    const value = files.get(path);
    if (!value) throw new Error("Synthetic workbook object not found");
    const original = Uint8Array.from(value);
    original[0] = (original[0] ?? 0) ^ 1;
    files.set(path, original);
  }, workbookHash);
  await populationCandidate.getByRole("button", { name: "Approve" }).click();
  await expect(
    populationCandidate.getByText("Approved", { exact: true }),
  ).toBeVisible();

  // Explicit local row inspection does not approve routing or alter the source.
  const rowReview = populationCandidate.getByRole("region", {
    name: "Local population record inspection",
  });
  const dictionaryPath = process.env.PBGC_DATA_DICTIONARY_PATH;
  if (dictionaryPath) {
    await rowReview.getByLabel("Generic field 1").fill("CUSTOMER_DELETE_FLAG");
    await expect(
      rowReview.getByText(/Load the approved Data Dictionary/),
    ).toBeVisible();
    const dictionary = await readFile(resolve(dictionaryPath));
    const dictionaryPicker = page.getByLabel("Select approved Data Dictionary");
    await dictionaryPicker.setInputFiles({
      name: "approved.xlsm",
      mimeType: "application/octet-stream",
      buffer: dictionary,
    });
    await expect(
      rowReview.getByText(/11 exact reference matches in different tables/),
    ).toBeVisible();
    const altered = Buffer.from(dictionary);
    altered[altered.length - 1] = (altered[altered.length - 1] ?? 0) ^ 1;
    await dictionaryPicker.setInputFiles({
      name: "altered.xlsm",
      mimeType: "application/octet-stream",
      buffer: altered,
    });
    await expect(
      rowReview.getByText(/Load the approved Data Dictionary/),
    ).toBeVisible();
    await expect(
      page.getByText(/bytes do not match the approved SHA-256/),
    ).toBeVisible();
  }
  await rowReview.getByLabel("Source sheet name").fill("Retirees");
  await rowReview.getByLabel("Source row number").fill("2");
  for (const [index, field, column] of [
    [1, "DOB", "A"],
    [2, "COMP", "D"],
    [3, "FV", "E"],
  ] as const) {
    if (index > 1)
      await rowReview
        .getByRole("button", { name: "Add field binding" })
        .click();
    await rowReview.getByLabel(`Generic field ${String(index)}`).fill(field);
    await rowReview.getByLabel(`Source column ${String(index)}`).fill(column);
    await rowReview
      .getByLabel(`Exact row-one header ${String(index)}`)
      .fill(field);
  }
  await rowReview
    .getByRole("button", { name: "Inspect source row locally" })
    .click();
  await expect(
    rowReview.getByText(
      /Local inspection only; no authorization or routing approval/,
    ),
  ).toBeVisible();
  await expect(
    rowReview.locator("li").filter({ hasText: '"COMP"' }),
  ).toContainText("D2: value — 42000");
  await expect(
    rowReview.locator("li").filter({ hasText: '"FV"' }),
  ).toContainText("E2: formula");
  await rowReview.getByRole("button", { name: "Clear local row view" }).click();
  await expect(rowReview.getByText(/Source row: 2/)).not.toBeVisible();
  await expect(rowReview.getByLabel("Source row number")).toHaveValue("");
  await rowReview.getByLabel("Source sheet name").fill("Retirees");
  await rowReview.getByLabel("Source row number").fill("2");
  await rowReview.getByLabel("Generic field 1").fill("COMP");
  await rowReview.getByLabel("Source column 1").fill("D");
  await rowReview.getByLabel("Exact row-one header 1").fill("COMP");
  await page.evaluate((sha) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const path = `objects/sha256/${sha.slice(0, 2)}/${sha}`;
    const value = files.get(path);
    if (!value) throw new Error("Synthetic workbook object not found");
    const altered = Uint8Array.from(value);
    altered[0] = (altered[0] ?? 0) ^ 1;
    files.set(path, altered);
  }, workbookHash);
  await rowReview
    .getByRole("button", { name: "Inspect source row locally" })
    .click();
  await expect(rowReview.getByRole("alert")).toContainText(
    "Population source check blocked",
  );
  await page.evaluate((sha) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const path = `objects/sha256/${sha.slice(0, 2)}/${sha}`;
    const value = files.get(path);
    if (!value) throw new Error("Synthetic workbook object not found");
    const original = Uint8Array.from(value);
    original[0] = (original[0] ?? 0) ^ 1;
    files.set(path, original);
  }, workbookHash);

  // 5. Architecture policy approval: approve all four parsed rule sets.
  const policy = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Architecture policy approval" }),
  });
  await policy.getByLabel("Policy approving actor").fill("governed-reviewer");
  await policy
    .getByLabel("Policy approval rationale")
    .fill("Parsed rule-set semantics reviewed and approved.");
  for (const item of await policy.locator("li").all()) {
    const approve = item.getByRole("button", {
      name: "Approve parsed policy",
    });
    await expect(approve).toBeEnabled();
    await approve.click();
  }

  // 6. Case controls: bind the single-calculation purpose and date range. The
  // single-calculation purpose creates the "Single Run" aggregation scenario,
  // whose formula governance is justified by the recorded case control
  // (the checkbox defaults to checked, so it stays on).
  const controls = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Case controls" }),
  });
  await controls
    .locator("label")
    .filter({ hasText: "Single calculation purpose" })
    .locator("input")
    .check();
  await controls.getByLabel("Effective date (start)").fill("2020-01-01");
  await controls
    .getByLabel("Case-controls approving actor")
    .fill("governed-reviewer");
  await controls
    .getByLabel("Case-controls approval rationale")
    .fill("E2E approved single-calculation controls.");
  await controls.getByRole("button", { name: "Approve case controls" }).click();
  await expect(controls.getByText("Approval recorded")).toBeVisible();
  await expect(
    controls.getByText(/does not authenticate the reviewer/u),
  ).toBeVisible();
  await expect(
    controls.getByText(/Effective dates: 2020-01-01/u),
  ).toBeVisible();

  // 7. Build a proposed architecture, then review its formula cells.
  const architecture = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Architecture selection" }),
  });
  await page.evaluate((sha) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const path = `objects/sha256/${sha.slice(0, 2)}/${sha}`;
    const bytes = files.get(path);
    if (!bytes) throw new Error("Synthetic plan object not found");
    const changed = Uint8Array.from(bytes);
    changed[0] = (changed[0] ?? 0) ^ 1;
    files.set(path, changed);
  }, planHash);
  await architecture
    .getByRole("button", { name: "Build proposed architecture" })
    .click();
  await expect(
    architecture.getByText(
      /Rule source verification blocked: The preserved source bytes do not match/u,
    ),
  ).toBeVisible();
  await page.evaluate(
    ({ sha, text }) => {
      const files = (
        globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
      ).__syntheticFiles;
      files.set(
        `objects/sha256/${sha.slice(0, 2)}/${sha}`,
        new TextEncoder().encode(text),
      );
    },
    { sha: planHash, text: PLAN_TEXT },
  );
  await architecture
    .getByRole("button", { name: "Build proposed architecture" })
    .click();
  await expect(
    architecture.getByText(/O\/B mapping lacks its exact formula/u),
  ).toBeVisible();
  await expect(
    architecture.getByRole("heading", {
      name: "Proposed formula target conflicts",
    }),
  ).toBeVisible();
  await expect(
    architecture.getByText(/This check does not approve the architecture/),
  ).toBeVisible();

  // Formula approval cannot invent test and oracle references.
  const formulaPanel = page.getByRole("region", {
    name: "Formula Governance",
  });
  await expect(
    formulaPanel.getByText(
      /Formula approval is blocked until governed test and oracle evidence/u,
    ),
  ).toBeVisible();
  const formulaButtons = formulaPanel.getByRole("button", {
    name: "Approve",
    exact: true,
  });
  await expect(formulaButtons).toHaveCount(2);
  for (const button of await formulaButtons.all())
    await expect(button).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Download V1 Workbook (.xlsx)" }),
  ).not.toBeVisible();
  await expect(
    architecture.getByRole("button", {
      name: "Download provisional workbook diagnostic (.json)",
    }),
  ).not.toBeVisible();

  // A subsequent build must re-read the source, not trust the saved profile.
  await page.evaluate((sha) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const path = `objects/sha256/${sha.slice(0, 2)}/${sha}`;
    const bytes = files.get(path);
    if (!bytes) throw new Error("Synthetic workbook object not found");
    const altered = Uint8Array.from(bytes);
    altered[0] = (altered[0] ?? 0) ^ 1;
    files.set(path, altered);
  }, workbookHash);
  await architecture
    .getByRole("button", { name: "Build proposed architecture" })
    .click();
  await expect(
    architecture.getByText(
      /Population verification blocked: The workbook bytes do not match/u,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download V1 Workbook (.xlsx)" }),
  ).not.toBeVisible();
  await expect(
    page.getByText("Select an architecture to review formula governance."),
  ).toBeVisible();
  // Restore the test bytes and show that withdrawing the population decision
  // clears the previously displayed architecture without another build.
  await page.evaluate((sha) => {
    const files = (
      globalThis as unknown as { __syntheticFiles: Map<string, Uint8Array> }
    ).__syntheticFiles;
    const path = `objects/sha256/${sha.slice(0, 2)}/${sha}`;
    const altered = files.get(path);
    if (!altered) throw new Error("Synthetic workbook object not found");
    const original = Uint8Array.from(altered);
    original[0] = (original[0] ?? 0) ^ 1;
    files.set(path, original);
  }, workbookHash);
  await architecture
    .getByRole("button", { name: "Build proposed architecture" })
    .click();
  await expect(
    architecture.getByText(/O\/B mapping lacks its exact formula/u),
  ).toBeVisible();
  await populationCandidate
    .getByRole("button", { name: "Withdraw approval" })
    .click();
  await expect(
    populationCandidate.getByText("Revoked", { exact: true }),
  ).toBeVisible();
  await expect(
    architecture.getByRole("heading", {
      name: "Proposed formula target conflicts",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Select an architecture to review formula governance."),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
  if (mode === "file") expect(httpRequests).toEqual([]);
}

for (const mode of ["development", "file"] as const) {
  test(`governed production path exposes unresolved workbook blockers (${mode})`, async ({
    offlinePage,
    outboundRequests,
  }) => {
    await exercisePipeline({ offlinePage, outboundRequests }, mode);
  });
}

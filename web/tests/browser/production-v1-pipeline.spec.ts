import { createHash } from "node:crypto";
import * as XLSX from "xlsx";

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

test("governed production path exposes unresolved workbook blockers", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  test.setTimeout(120_000);
  await createSyntheticCase(page, "PBGC-V1-PRODUCTION-001");

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
    .getByLabel("Authorized reviewer", { exact: true })
    .fill("architect-reviewer");
  await page
    .getByLabel("Approval rationale", { exact: true })
    .fill("E2E authored retirement-benefit rule.");

  const submitRule = page.getByRole("button", {
    name: "Validate rule preview",
  });
  // Author the early-retirement-provision rule: it fully satisfies exactly
  // the ERD trigger declared in rules/scenario-selection.yaml while leaving
  // every other scenario with zero matched conditions, so the governed
  // scenario selector has no partial (incomplete) trigger combinations.
  await page.getByLabel("Dimension").selectOption({
    label: "Early retirement provision",
  });
  await page.getByLabel("Condition value").fill("true");
  await expect(submitRule).toBeEnabled();
  await submitRule.click();
  await expect(submitRule).toBeEnabled();
  await expect(
    page.getByText(
      /Governed validation passed and the plan-rule record was persisted locally/,
    ),
  ).toBeVisible();

  // 4. Population: approve the workbook-derived population candidate.
  const population = await approveSharedPanel(
    page,
    "Population candidate review",
    "governed-reviewer",
    "Synthetic population workbook reviewed locally.",
  );
  const populationCandidate = population.locator("li").first();
  await populationCandidate.getByRole("button", { name: "Approve" }).click();
  await expect(
    populationCandidate.getByText("Approved", { exact: true }),
  ).toBeVisible();

  // 5. Architecture policy approval: approve all four parsed rule sets.
  const policy = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Architecture policy approval" }),
  });
  await policy.getByLabel("Policy approving actor").fill("governed-reviewer");
  await policy
    .getByLabel("Policy approval rationale")
    .fill("Parsed rule-set semantics reviewed and approved.");
  for (const item of await policy.locator("li").all()) {
    const approve = item.getByRole("button", { name: "Approve parsed policy" });
    await expect(approve).toBeEnabled();
    await approve.click();
  }

  // 6. Case controls: bind the single-calculation purpose and date range. The
  // single-calculation purpose creates the "Single Run" aggregation scenario,
  // whose formula governance is justified by the authenticated case control
  // (the checkbox defaults to checked, so it stays on).
  const controls = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Authenticated case controls" }),
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
  await expect(controls.getByText("Human approved")).toBeVisible();

  // 7. Build a proposed architecture, then review its formula cells.
  const architecture = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Architecture selection" }),
  });
  await architecture
    .getByRole("button", { name: "Build proposed architecture" })
    .click();
  await expect(
    architecture.getByText(/O\/B mapping lacks its exact formula/u),
  ).toBeVisible();

  // 7c. Formula governance: approve the O-classified FV formula and the
  // B-classified CALC_INDICATOR formula in each governed scenario group
  // (ERD, justified by the authored early-retirement-provision rule; Single
  // Run, justified by the authenticated case control), then rebuild.
  const formulaPanel = page.getByRole("region", { name: "Formula Governance" });
  const formulaGroups = formulaPanel.locator(".formula-scenario-group");
  await expect(formulaGroups).toHaveCount(2);
  for (const group of await formulaGroups.all()) {
    await expect(group.locator(".formula-row")).toHaveCount(2);
    for (const row of await group.locator(".formula-row").all()) {
      await row.getByRole("button", { name: "Approve", exact: true }).click();
      await group
        .locator(".plan-rule-checkbox input[type='checkbox']")
        .first()
        .check();
      await group
        .locator(".rationale-input textarea")
        .first()
        .fill("E2E approved formula governance.");
      await group.getByRole("button", { name: "Confirm Approval" }).click();
      await expect(row.getByText("Approved", { exact: true })).toBeVisible();
    }
    await expect(
      group.getByText("2/2 formulas approved", { exact: true }),
    ).toBeVisible();
  }
  await expect(
    formulaPanel.getByText("4/4 formulas approved", { exact: true }),
  ).toBeVisible();

  await architecture
    .getByRole("button", { name: "Build proposed architecture" })
    .click();
  await expect(
    architecture.getByText(
      /More than one scenario writes to the same workbook cell/u,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download V1 Workbook (.xlsx)" }),
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
    architecture.getByText(
      /More than one scenario writes to the same workbook cell/u,
    ),
  ).toBeVisible();
  await populationCandidate
    .getByRole("button", { name: "Withdraw approval" })
    .click();
  await expect(
    populationCandidate.getByText("Revoked", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Select an architecture to review formula governance."),
  ).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

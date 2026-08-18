import * as XLSX from "xlsx";

import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";

const PLAN_TEXT =
  "Executed Defined Benefit Plan Document. Effective 2020-01-01.";

function populationWorkbook(): Uint8Array {
  // The Retirees tab pattern requires DOB, NRD, BSEX, COMP, and FV
  // (rules/tab-selection.yaml). FV is O-classified by
  // rules/iob-classification.yaml, so the governed BuildSpec demands an
  // approved formula for it: the FV column carries a real formula that the
  // reviewer approves through Formula Governance before the rebuild.
  const workbook = XLSX.utils.book_new();
  const retirees = XLSX.utils.aoa_to_sheet([
    ["DOB", "NRD", "BSEX", "COMP", "FV"],
    ["1960-05-12", "2025-05-01", "M", 42000, null],
  ]);
  // aoa_to_sheet keeps "=" strings as text, so write the FV formula as an
  // explicit formula cell. Leaving the cached result absent means the passive
  // parser records only the formula text (no stored-value "example" segment),
  // so candidate extraction emits no blocking unresolved item. The reference
  // targets D1 (the COMP header cell) because only header and formula cells
  // are included in the governed architecture; plain value cells are not.
  retirees.E2 = { t: "n", f: "D1*0.05" };
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

test("completes the governed production path from intake to V1 workbook", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  test.setTimeout(120_000);
  await createSyntheticCase(page, "PBGC-V1-PRODUCTION-001");

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
      buffer: Buffer.from(populationWorkbook()),
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

  // 6. Case controls: bind the single-calculation purpose and date range.
  const controls = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Authenticated case controls" }),
  });
  // The case controls bind the effective date range without selecting the
  // single-calculation purpose (unchecked from its default): that purpose
  // would create the "Single Run" aggregation scenario, which has no
  // plan-rule justification of its own for formula governance.
  await controls
    .locator("label")
    .filter({ hasText: "Single calculation purpose" })
    .locator("input")
    .uncheck();
  await controls.getByLabel("Effective date (start)").fill("2020-01-01");
  await controls
    .getByLabel("Case-controls approving actor")
    .fill("governed-reviewer");
  await controls
    .getByLabel("Case-controls approval rationale")
    .fill("E2E approved single-calculation controls.");
  await controls.getByRole("button", { name: "Approve case controls" }).click();
  await expect(controls.getByText("Human approved")).toBeVisible();

  // 7. Architecture selection: build the V1 engine and generate the workbook.
  const architecture = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Architecture selection" }),
  });
  await expect(
    architecture.getByText("No governed scenarios are available."),
  ).not.toBeVisible();
  const scenarioFieldset = architecture
    .locator("fieldset")
    .filter({ hasText: "Calculation scenarios" });
  await expect(scenarioFieldset.locator("input")).toHaveCount(1);
  for (const input of await scenarioFieldset.locator("input").all()) {
    await input.check();
  }
  const tabFieldset = architecture
    .locator("fieldset")
    .filter({ hasText: "Source tabs" });
  await expect(tabFieldset.locator("input")).toHaveCount(2);
  for (const input of await tabFieldset.locator("input").all()) {
    await input.check();
  }
  await architecture
    .getByLabel("Reviewer", { exact: true })
    .fill("architect-reviewer");
  await architecture
    .getByLabel("Architecture approval rationale")
    .fill("E2E approved scenario and tab selection.");
  // 7b. First build attempt: the O-classified FV column blocks BuildSpec until
  // its formula receives explicit human governance approval.
  await architecture
    .getByRole("button", { name: "Approve architecture selection" })
    .click();
  await expect(
    architecture.getByText(/O\/B mapping lacks its exact formula/u),
  ).toBeVisible();

  // 7c. Formula governance: approve the FV formula for the governed ERD
  // scenario against the authored early-retirement-provision rule, then
  // rebuild.
  const formulaPanel = page.getByRole("region", { name: "Formula Governance" });
  await formulaPanel
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await formulaPanel
    .locator(".plan-rule-checkbox input[type='checkbox']")
    .first()
    .check();
  await formulaPanel
    .locator(".rationale-input textarea")
    .first()
    .fill("E2E approved FV formula governance.");
  await formulaPanel.getByRole("button", { name: "Confirm Approval" }).click();
  await expect(
    formulaPanel.getByText("Approved", { exact: true }).first(),
  ).toBeVisible();

  await architecture
    .getByRole("button", { name: "Approve architecture selection" })
    .click();
  await expect(
    architecture.getByText(/V1 output built: architecture → BuildSpec/u),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download V1 Workbook (.xlsx)" }),
  ).toBeVisible();

  expect(outboundRequests).toEqual([]);
});

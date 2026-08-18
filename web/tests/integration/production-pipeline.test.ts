import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildArchitecture } from "../../src/domain/architecture/architecture-builder";
import {
  caseControlContentHash,
  type AuthenticatedCaseControls,
} from "../../src/domain/architecture/scenario-selector";
import {
  policyContentHash,
  type LoadedRuleSets,
  type RuleSet,
  type ScenarioSelectionRule,
} from "../../src/domain/architecture/rule-loader";
import {
  architecturePolicyDecisionContentHash,
  type ArchitecturePolicyApproval,
} from "../../src/domain/architecture/architecture-policy-approval";
import type { V1Architecture } from "../../src/domain/architecture/models";
import { authorRule } from "../../src/domain/plan-rules/rule-authoring";
import type { PlanRuleRecord } from "../../src/domain/plan-rules/models";
import {
  parseUtcTimestamp,
  type Sha256,
  type Uuid,
} from "../../src/domain/shared/types";
import {
  createPopulationCandidate,
  createPopulationEvidenceObservation,
  populationDecisionContentHash,
  type PopulationCandidateDecision,
} from "../../src/domain/population/population-profile";
import { workbookProfileContentHash } from "../../src/domain/population/workbook-adapter";
import { buildSpecEngine } from "../../src/domain/build-spec/build-spec-engine";
import { formulaApprovalContentHash } from "../../src/domain/build-spec/formula-approval";
import type { FormulaGovernanceInput } from "../../src/domain/build-spec/models";
import { compileBuildSpec } from "../../src/domain/formula-compiler/compiler";
import { buildWorkbook } from "../../src/domain/workbook-builder/workbook-builder";
import { buildXLSXSpec } from "../../src/domain/workbook-builder/serialization";
import {
  candidate,
  citation,
  evidenceCatalog,
  human,
} from "../unit/domain/plan-rules/governed-fixtures";

const builtAtValue = "2026-07-29T12:00:00.000Z";
const builtAtResult = parseUtcTimestamp(builtAtValue);
if (!builtAtResult.ok) throw new Error("Invalid test timestamp.");
const builtAt = builtAtResult.value;
const caseId = "00000000-0000-4000-8000-000000000505" as Uuid;
const architectureId = "00000000-0000-4000-8000-000000000504" as Uuid;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex") as Sha256;
const populationHuman = {
  actorType: "human" as const,
  actorId: "synthetic-reviewer",
  displayName: "Synthetic Reviewer",
};

async function approve<T extends Pick<RuleSet, "kind"> & Partial<RuleSet>>(
  payload: T,
): Promise<Extract<RuleSet, { kind: T["kind"] }>> {
  const candidateRuleSet = {
    ...payload,
    version: "1.0.0",
    policyContentSha256: hash("pending"),
    sourceFileSha256: hash(`${payload.kind} source`),
    governance: { reviewStatus: "provisional" as const },
  } as RuleSet;
  const contentHash = await policyContentHash(candidateRuleSet);
  return {
    ...candidateRuleSet,
    policyContentSha256: contentHash,
  } as unknown as Extract<RuleSet, { kind: T["kind"] }>;
}

function erdScenarioRules(): readonly ScenarioSelectionRule[] {
  return [
    {
      id: "ERD",
      label: "Early Retirement Date",
      triggerConditions: [
        {
          dimension: "early-retirement-provision",
          operator: "present",
          value: true,
          source: "plan-rule",
        },
      ],
      exclusionConditions: [],
      defaultEffectiveDateRange: { startDate: "1974-09-02", endDate: null },
    },
    // The Single Run aggregation scenario is triggered by the authenticated
    // case control alone; its run carries no plan-rule justification.
    {
      id: "Single Run",
      label: "Single Calculation Run",
      triggerConditions: [
        {
          dimension: "case-purpose",
          operator: "equals",
          value: "single-calculation",
          source: "case-control",
        },
      ],
      exclusionConditions: [],
      defaultEffectiveDateRange: { startDate: "1974-09-02", endDate: null },
    },
  ];
}

async function approvedDefActPolicies(
  scenarioRules: readonly ScenarioSelectionRule[],
): Promise<LoadedRuleSets> {
  return {
    scenarioSelection: await approve({
      kind: "scenario-selection",
      rules: scenarioRules,
    }),
    tabSelection: await approve({
      kind: "tab-selection",
      rules: [
        {
          tabPattern: "Def_Act Non-Vested",
          requiredFields: ["DOB", "BSEX", "COMP"],
          populationRequirement: "active-non-vested-participants",
          description: "Active non-vested participants",
        },
      ],
    }),
    iobClassification: await approve({
      kind: "iob-classification",
      rules: [
        ...["DOB", "BSEX", "COMP"].map((fieldPattern) => ({
          fieldPattern,
          runPattern: "*",
          iob: "I" as const,
          priority: 50,
          justification: `${fieldPattern} is read from population data`,
        })),
        {
          fieldPattern: "ACC_BEN",
          runPattern: "*",
          iob: "O" as const,
          priority: 50,
          justification: "Accrued benefit is a calculated result",
        },
      ],
    }),
    fieldNameGlossary: await approve({
      kind: "field-name-glossary",
      entries: [
        {
          workbookPattern: "DOB",
          genericField: "DOB",
          description: "Date of birth",
          tabContext: null,
        },
        {
          workbookPattern: "BSEX",
          genericField: "BSEX",
          description: "Benefit sex",
          tabContext: null,
        },
        {
          workbookPattern: "COMP",
          genericField: "COMP",
          description: "Compensation",
          tabContext: null,
        },
        {
          workbookPattern: "ACC_BEN",
          genericField: "ACC_BEN",
          description: "Accrued benefit",
          tabContext: null,
        },
      ],
    }),
  };
}

function defActCell(
  address: string,
  storedValue: string | number | null,
  formulaText: string | null,
) {
  return {
    sheet: "Def_Act Non-Vested",
    address,
    storedValue,
    formulaText,
    cellType: "s",
    kind: formulaText === null ? ("text" as const) : ("formula-text" as const),
  };
}

async function governedDefActFixture() {
  const catalog = await evidenceCatalog();
  const ruleResult = await authorRule(
    {
      proposedCandidates: [
        await candidate("Early retirement provision applies."),
      ],
      primaryCitation: citation,
      catalog,
      unresolvedRecords: [],
      authorityOverrides: [],
      governingRestatement: "Early retirement provision applies.",
      effectiveDate: "2020-01-01",
      endDate: null,
      applicabilityConditions: [
        {
          dimension: "early-retirement-provision",
          value: "true",
          evidence: [citation],
        },
      ],
      requiredApplicabilityDimensions: ["early-retirement-provision"],
      affectedScope: "provision/erd",
      reviewer: human,
      approvalRationale: "Approved synthetic ERD rule fixture.",
      confidence: 1,
      ruleSetVersion: "1.0.0",
    },
    { uuid: () => "00000000-0000-4000-8000-000000000506", now: () => builtAt },
  );
  if (!ruleResult.ok) throw new Error(ruleResult.error.message);

  const controlContent = {
    controlId: "00000000-0000-4000-8000-000000000507" as Uuid,
    // The single-calculation case purpose triggers the Single Run aggregation
    // scenario, whose run is justified by the authenticated case control
    // alone (no plan-rule justification of its own).
    dimensions: { "case-purpose": "single-calculation" },
    effectiveDateRange: { startDate: "2020-01-01", endDate: null },
    reviewStatus: "human-approved" as const,
    approvedBy: "Synthetic Reviewer",
    approvalRationale: "Approved synthetic case controls.",
  };
  const caseControls: AuthenticatedCaseControls = {
    ...controlContent,
    caseControlContentSha256: await caseControlContentHash(controlContent),
  };
  const policies = await approvedDefActPolicies(erdScenarioRules());

  const populationArtifact = catalog.caseEvidence[0];
  if (populationArtifact === undefined)
    throw new Error("Synthetic catalog has no released case evidence.");
  const observation = await createPopulationEvidenceObservation({
    citationId: "def-act-population-observation",
    artifactSha256: populationArtifact.sha256,
    sourceLocator: "synthetic/workbook#Def_Act Non-Vested",
    evidenceKind: "population-characteristic",
    observedTextOrValue: {
      dimension: "participant-group",
      value: "active-non-vested-participants",
    },
  });
  const populationCandidate = await createPopulationCandidate({
    artifactSha256: populationArtifact.sha256,
    candidateStatus: "proposed",
    detectorIdentity: "synthetic-test",
    detectorVersion: "1.0.0",
    confidence: 1,
    evidence: [observation],
    observedFields: ["DOB", "BSEX", "COMP", "ACC_BEN"],
    recordCounts: [2],
    sensitivity: "synthetic-mock",
    correctionsOrImputationsApplied: false,
  });
  const workbook = {
    status: "profiled" as const,
    sheets: [
      {
        name: "Def_Act Non-Vested",
        hidden: false,
        cells: [
          defActCell("A1", "DOB", null),
          defActCell("B1", "BSEX", null),
          defActCell("C1", "COMP", null),
          defActCell("A2", "1960-05-12", null),
          defActCell("B2", "M", null),
          defActCell("C2", 42000, null),
          // ACC_BEN is an observed O/B field: a header label cell (D1) and a
          // formula cell (D2) that derives from the COMP header cell.
          defActCell("D1", "ACC_BEN", null),
          defActCell("D2", null, "=C1*0.01"),
        ],
      },
    ],
    formulaExecutionCount: 0 as const,
    limitations: [],
  };
  const workbookProfileSha256 = await workbookProfileContentHash(workbook, []);
  const decisionWithoutHash = {
    decisionId: "00000000-0000-4000-8000-000000000509",
    appendOrdinal: 1,
    priorDecisionId: null,
    priorDecisionContentSha256: null,
    candidateKey: populationCandidate.candidateKey,
    artifactSha256: populationCandidate.artifactSha256,
    workbookProfileContentSha256: workbookProfileSha256,
    decisionType: "approve" as const,
    humanActor: populationHuman,
    rationale: "Approved synthetic Def_Act population evidence.",
    decisionTimestamp: builtAt,
    resultingStatus: "approved" as const,
    ruleSetVersion: "1.0.0",
    schemaVersion: "1.0.0",
  };
  const populationDecision: PopulationCandidateDecision = {
    ...decisionWithoutHash,
    decisionContentSha256:
      await populationDecisionContentHash(decisionWithoutHash),
  };

  const policyDecisions = await Promise.all(
    [
      policies.scenarioSelection,
      policies.tabSelection,
      policies.iobClassification,
      policies.fieldNameGlossary,
    ].map((policy, index) => approvePolicy(policy, catalog, index)),
  );

  return {
    caseId,
    workbookProfileSha256,
    planRules: [ruleResult.value],
    evidenceCatalog: catalog,
    authorityOverrides: [],
    population: {
      candidates: [
        {
          candidate: populationCandidate,
          evidenceObservations: [observation],
          decisions: [populationDecision],
          workbook,
          namedRanges: [] as never[],
        },
      ],
    },
    caseControls,
    policies,
    policyApprovals: { evidenceCatalog: catalog, decisions: policyDecisions },
    dependencies: { uuid: () => architectureId, now: () => builtAt },
  };
}

async function approvePolicy(
  policy: RuleSet,
  catalog: Awaited<ReturnType<typeof evidenceCatalog>>,
  index: number,
): Promise<ArchitecturePolicyApproval> {
  const artifact = catalog.caseEvidence[0];
  if (artifact === undefined) throw new Error("Missing approval evidence.");
  const content = {
    decisionId:
      `00000000-0000-4000-8000-${String(420 + index).padStart(12, "0")}` as Uuid,
    appendOrdinal: 1,
    priorDecisionId: null,
    priorDecisionContentSha256: null,
    decisionType: "approve" as const,
    resultingStatus: "approved" as const,
    policyKind: policy.kind,
    policyVersion: policy.version,
    policyContentSha256: policy.policyContentSha256,
    sourceFileSha256: policy.sourceFileSha256,
    evidenceCatalogId: catalog.catalogId,
    evidenceCatalogContentSha256: catalog.catalogContentSha256,
    evidenceCitations: [
      {
        sourceArtifactSha256: artifact.sha256,
        sourceLocator: `synthetic/${policy.kind}`,
        effectiveDate: "2020-01-01",
        adoptionDate: "2019-12-01",
        supersedesArtifactSha256: null,
      },
    ],
    humanActor: human,
    rationale: `Approved synthetic ${policy.kind} policy.`,
    decidedAt: builtAt as never,
    schemaVersion: "1.0.0" as const,
  };
  return {
    ...content,
    decisionContentSha256: await architecturePolicyDecisionContentHash(content),
  };
}

// The ACC_BEN formula cell (Def_Act Non-Vested::D2) is observed in both the
// plan-rule-justified ERD run and the case-control-justified Single Run
// aggregation scenario, so formula governance must bind a governing rule in
// each run before BuildSpec accepts the formula.
async function approvedFormulaGovernance(
  rule: PlanRuleRecord | undefined,
  architecture: V1Architecture,
): Promise<FormulaGovernanceInput> {
  if (rule === undefined) throw new Error("Missing governed plan rule.");
  const cellKey = "Def_Act Non-Vested::D2";
  const cell = architecture.cells.get(cellKey);
  if (cell === undefined)
    throw new Error("Formula cell missing from the architecture.");
  const formulaText = cell.formulaText;
  if (formulaText === null)
    throw new Error("Formula cell missing from the architecture.");
  const runs = [...architecture.runs].sort((left, right) =>
    left.runId.localeCompare(right.runId),
  );
  const entries = await Promise.all(
    runs.map(async (run, index) => {
      const classification = cell.perRunClassification.get(run.runId);
      const content = {
        decisionId:
          `00000000-0000-4000-8000-${String(711 + index).padStart(12, "0")}` as Uuid,
        appendOrdinal: 1,
        priorDecisionId: null,
        priorDecisionContentSha256: null,
        decisionType: "approve" as const,
        resultingStatus: "approved" as const,
        formulaText,
        target: {
          tabName: cell.sourceTab,
          cellAddress: cell.cellAddress,
          genericField: cell.genericField,
        },
        scenarioId: run.runId,
        iobClassification:
          classification?.iob === "B" ? ("B" as const) : ("O" as const),
        sourcePlanRules: [
          {
            ruleId: rule.ruleId,
            ruleContentSha256: rule.ruleContentSha256,
            relationship: "governing" as const,
          },
        ],
        derivationDescription: `Reviewed ${cell.genericField} derivation for ${run.runId}.`,
        affectedTestIds: [`TEST-${run.runId}`],
        regenerationImpact: "Regenerate compiler and workbook artifacts.",
        validationOracleIds: [`ORACLE-${run.runId}`],
        humanActor: human,
        rationale: `Approved ${cell.genericField} formula for ${run.runId}.`,
        decidedAt: builtAt,
        schemaVersion: "1.0.0" as const,
      };
      return {
        cellKey,
        scenarioId: run.runId,
        approvalDecisions: [
          {
            ...content,
            decisionContentSha256: await formulaApprovalContentHash(content),
          },
        ],
      };
    }),
  );
  return { approvedPlanRules: [rule], formulas: entries };
}

describe("Feature 005/006/007 governed production pipeline integration", () => {
  it("completes the Def_Act Non-Vested production path to a compiled V1 workbook", async () => {
    const fixture = await governedDefActFixture();
    const { workbookProfileSha256 } = fixture;

    const architectureResult = await buildArchitecture(fixture);
    expect(architectureResult.ok).toBe(true);
    if (!architectureResult.ok) return;
    const architecture = architectureResult.value.architecture;
    expect(architecture.sourceTabs.map((tab) => tab.tabName)).toContain(
      "Def_Act Non-Vested",
    );
    expect(architecture.runs.map((run) => run.runId)).toEqual([
      "ERD@2020-01-01..open",
      "Single Run@2020-01-01..open",
    ]);
    const singleRun = architecture.runs.find(
      (run) => run.runId === "Single Run@2020-01-01..open",
    );
    expect(singleRun?.justifications).toEqual([
      {
        source: "case-control",
        referenceId: fixture.caseControls.controlId,
        referenceContentSha256: fixture.caseControls.caseControlContentSha256,
      },
    ]);

    const { dependencies: ignored, ...architectureGovernance } = fixture;
    void ignored;
    const buildSpecResult = await buildSpecEngine({
      architecture,
      architectureGovernance,
      formulaGovernance: await approvedFormulaGovernance(
        fixture.planRules[0],
        architecture,
      ),
    });
    expect(buildSpecResult.ok).toBe(true);
    if (!buildSpecResult.ok) return;
    const buildSpec = buildSpecResult.buildSpec;
    expect(buildSpec.schemaVersion).toBe("2.0.0");
    expect(buildSpec.cellMappings.length).toBeGreaterThan(0);
    // The ACC_BEN formula must be governed in both the plan-rule-justified
    // ERD run and the case-control-justified Single Run aggregation scenario.
    expect(
      buildSpec.formulas.map((formula) => formula.scenarioId).sort(),
    ).toEqual(["ERD@2020-01-01..open", "Single Run@2020-01-01..open"]);
    expect(
      buildSpec.formulas.every(
        (formula) =>
          formula.tabName === "Def_Act Non-Vested" &&
          formula.genericField === "ACC_BEN" &&
          formula.formulaText === "=C1*0.01",
      ),
    ).toBe(true);
    // The D1 header label cell must not duplicate the D2 formula mapping for
    // the ACC_BEN field (one mapping per scenario, formula-bearing).
    const accrualMappings = buildSpec.cellMappings.filter(
      (mapping) => mapping.field === "ACC_BEN",
    );
    expect(accrualMappings).toHaveLength(2);
    expect(
      accrualMappings.every(
        (mapping) => mapping.cellAddress === "D2" && mapping.formulaId !== null,
      ),
    ).toBe(true);

    const compilation = await compileBuildSpec({
      buildSpec,
      compilerVersion: "1.0.0",
      clock: { now: () => builtAt },
      uuid: { generate: () => architectureId },
    });
    expect(compilation.status).toBe("complete");

    const populationData = new Map<string, Map<string, unknown[]>>();
    const columnMap = new Map<string, unknown[]>();
    for (const cell of fixture.population.candidates[0]?.workbook.sheets[0]
      ?.cells ?? []) {
      const column = /^([A-Z]+)/u.exec(cell.address)?.[1] ?? "A";
      const existing = columnMap.get(column) ?? [];
      existing.push(cell.storedValue);
      columnMap.set(column, existing);
    }
    populationData.set("Def_Act Non-Vested", columnMap);

    const workbookResult = await buildWorkbook({
      buildSpec,
      populationProfile: {
        status: "approved",
        effectiveDecisionId: "00000000-0000-4000-8000-000000000509",
        effectiveWorkbookProfileContentSha256: workbookProfileSha256,
        provenance: [],
      },
      workbookProfileContentSha256: workbookProfileSha256,
      generatorVersion: "1.0.0",
      populationData,
    });
    expect(workbookResult.ok).toBe(true);
    if (!workbookResult.ok) return;
    const sheetNames = buildXLSXSpec(workbookResult.workbook).sheets.map(
      (sheet) => sheet.name,
    );
    expect(sheetNames).toEqual(
      expect.arrayContaining(["Summary", "Tables", "UD Table"]),
    );
  });
});

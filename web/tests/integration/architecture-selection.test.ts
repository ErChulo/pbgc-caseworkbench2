import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildArchitecture } from "../../src/domain/architecture/architecture-builder";
import {
  architecturePolicyDecisionContentHash,
  type ArchitecturePolicyApproval,
} from "../../src/domain/architecture/architecture-policy-approval";
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
import { computeArchitectureContentSha256 } from "../../src/domain/architecture/workspace-adapter";
import { authorRule } from "../../src/domain/plan-rules/rule-authoring";
import type { Sha256, Uuid } from "../../src/domain/shared/types";
import {
  createPopulationCandidate,
  createPopulationEvidenceObservation,
  populationDecisionContentHash,
  type PopulationCandidateDecision,
} from "../../src/domain/population/population-profile";
import { workbookProfileContentHash } from "../../src/domain/population/workbook-adapter";
import {
  candidate,
  citation,
  evidenceCatalog,
  human,
} from "../unit/domain/plan-rules/governed-fixtures";

const builtAt = "2026-07-29T12:00:00.000Z";
const architectureId = "00000000-0000-4000-8000-000000000404" as Uuid;
const caseId = "00000000-0000-4000-8000-000000000405" as Uuid;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex") as Sha256;
const populationHuman = {
  actorType: "human" as const,
  actorId: "synthetic-reviewer",
  displayName: "Synthetic Reviewer",
};

describe("Feature 004 architecture selection integration", () => {
  it("composes governed inputs and replays deterministic content and hash", async () => {
    const fixture = await approvedFixture();
    const first = await buildArchitecture(fixture);
    const second = await buildArchitecture(fixture);

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    if (!first.ok) return;
    const { architecture } = first.value;
    expect([...architecture.cells.keys()]).toEqual([
      "Synthetic Retirees::A1",
      "Synthetic Retirees::B1",
      "Synthetic Retirees::B2",
      "Tables::A1",
      "Tables::B1",
      "Tables::B2",
    ]);
    expect(
      architecture.sourceTabs.map((tab) => [tab.tabName, tab.role]),
    ).toEqual([
      ["Synthetic Retirees", "population"],
      ["Tables", "support"],
    ]);
    expect(architecture.sourceTabs[0]?.populationCandidateKey).toBe(
      fixture.population.candidates[0]?.candidate.candidateKey,
    );
    expect(architecture.sourceTabs[1]?.populationCandidateKey).toBeNull();
    expect(architecture.sourceTabs[1]?.populationArtifactSha256).toBeNull();
    expect(architecture.formulaDependencies).toEqual([
      {
        dependentKey: "Synthetic Retirees::B2",
        dependencyKey: "Synthetic Retirees::A1",
        runId: "NRD@2020-01-01..open",
        referenceType: "cell",
      },
      {
        dependentKey: "Tables::B2",
        dependencyKey: "Tables::A1",
        runId: "NRD@2020-01-01..open",
        referenceType: "cell",
      },
    ]);
    expect(architecture.namedRanges).toEqual([
      {
        name: "Birth_Date",
        cellAddress: "A1",
        sourceTab: "Synthetic Retirees",
        scope: "workbook",
        genericField: "DOB",
      },
      {
        name: "Freeze_Date",
        cellAddress: "A1",
        sourceTab: "Tables",
        scope: "workbook",
        genericField: "FREEZE_DATE",
      },
    ]);
    expect(computeArchitectureContentSha256(architecture)).toBe(
      architecture.architectureContentSha256,
    );
    const replayRecord = {
      ...architecture,
      architectureId: "00000000-0000-4000-8000-000000000499" as Uuid,
      builtAt: "2027-01-01T00:00:00.000Z" as never,
    };
    expect(computeArchitectureContentSha256(replayRecord)).toBe(
      architecture.architectureContentSha256,
    );
  });

  it("rejects a policy whose human approval is not bound to its content", async () => {
    const fixture = await approvedFixture();
    const changed = {
      ...fixture.policies.tabSelection,
      rules: [
        ...fixture.policies.tabSelection.rules,
        {
          tabPattern: "Invented",
          requiredFields: [],
          populationRequirement: null,
          description: "Unapproved mutation",
        },
      ],
    };
    const result = await buildArchitecture({
      ...fixture,
      policies: { ...fixture.policies, tabSelection: changed },
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVALID_RULE_SET",
        message: "tab-selection policy content hash is invalid.",
      },
    });
  });

  it("rejects a tampered population projection before selection", async () => {
    const fixture = await approvedFixture();
    const population = {
      candidates: fixture.population.candidates.map((binding) => ({
        ...binding,
        candidate: { ...binding.candidate, observedFields: ["DOB", "UNKNOWN"] },
        workbook: {
          ...binding.workbook,
          sheets: binding.workbook.sheets.map((sheet) => ({
            ...sheet,
            cells: sheet.cells.map((cell, index) =>
              index === 1 ? { ...cell, storedValue: "UNKNOWN" } : cell,
            ),
          })),
        },
      })),
    };
    const result = await buildArchitecture({ ...fixture, population });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_RULE_SET");
    expect(result.error.message).toMatch(/candidate content/u);
  });

  it("rejects workbook-only and named-range tampering after population approval", async () => {
    const fixture = await approvedFixture();
    const binding = fixture.population.candidates[0];
    if (binding === undefined) throw new Error("Missing population fixture.");
    const workbookTamper = await buildArchitecture({
      ...fixture,
      population: {
        candidates: [
          {
            ...binding,
            workbook: {
              ...binding.workbook,
              limitations: ["Unapproved workbook-only mutation."],
            },
          },
        ],
      },
    });
    const namedRange = binding.namedRanges[0];
    if (namedRange === undefined)
      throw new Error("Missing named-range fixture.");
    const namedRangeTamper = await buildArchitecture({
      ...fixture,
      population: {
        candidates: [
          {
            ...binding,
            namedRanges: [{ ...namedRange, name: "Tampered_Name" }],
          },
        ],
      },
    });
    expect(workbookTamper.ok).toBe(false);
    expect(namedRangeTamper.ok).toBe(false);
    if (!workbookTamper.ok)
      expect(workbookTamper.error.message).toMatch(/workbook profile/u);
    if (!namedRangeTamper.ok)
      expect(namedRangeTamper.error.message).toMatch(/workbook profile/u);
  });

  it("rejects a revoked policy approval", async () => {
    const fixture = await approvedFixture();
    const prior = fixture.policyApprovals.decisions.find(
      (decision) => decision.policyKind === "tab-selection",
    );
    if (prior === undefined)
      throw new Error("Missing policy approval fixture.");
    const revokedWithoutHash = {
      ...prior,
      decisionId: "00000000-0000-4000-8000-000000000430" as Uuid,
      appendOrdinal: 2,
      priorDecisionId: prior.decisionId,
      priorDecisionContentSha256: prior.decisionContentSha256,
      decisionType: "revoke" as const,
      resultingStatus: "revoked" as const,
      rationale: "Synthetic revocation test.",
      decidedAt: "2026-07-29T13:00:00.000Z" as never,
    };
    const { decisionContentSha256: ignored, ...revocationContent } =
      revokedWithoutHash;
    void ignored;
    const revocation = {
      ...revocationContent,
      decisionContentSha256:
        await architecturePolicyDecisionContentHash(revocationContent),
    };
    const result = await buildArchitecture({
      ...fixture,
      policyApprovals: {
        ...fixture.policyApprovals,
        decisions: [...fixture.policyApprovals.decisions, revocation],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/non-revoked/u);
  });

  it("rejects a revoked population approval", async () => {
    const fixture = await approvedFixture();
    const binding = fixture.population.candidates[0];
    const prior = binding?.decisions[0];
    if (binding === undefined || prior === undefined)
      throw new Error("Missing population approval fixture.");
    const revocationContent = {
      ...prior,
      decisionId: "00000000-0000-4000-8000-000000000431",
      appendOrdinal: 2,
      priorDecisionId: prior.decisionId,
      priorDecisionContentSha256: prior.decisionContentSha256,
      decisionType: "revoke" as const,
      resultingStatus: "revoked" as const,
      rationale: "Synthetic population revocation.",
      decisionTimestamp: "2026-07-29T13:00:00.000Z",
    };
    const revocation: PopulationCandidateDecision = {
      ...revocationContent,
      decisionContentSha256:
        await populationDecisionContentHash(revocationContent),
    };
    const result = await buildArchitecture({
      ...fixture,
      population: {
        candidates: [
          { ...binding, decisions: [...binding.decisions, revocation] },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/non-revoked/u);
  });

  it("rejects a tampered EvidenceCatalog before approval replay", async () => {
    const fixture = await approvedFixture();
    const firstArtifact = fixture.evidenceCatalog.caseEvidence[0];
    if (firstArtifact === undefined)
      throw new Error("Missing catalog fixture.");
    const evidenceCatalog = {
      ...fixture.evidenceCatalog,
      caseEvidence: [
        { ...firstArtifact, locator: "synthetic/tampered-location" },
        ...fixture.evidenceCatalog.caseEvidence.slice(1),
      ],
    };
    const result = await buildArchitecture({ ...fixture, evidenceCatalog });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.message).toMatch(/catalog content hash/u);
  });

  it("aggregates scenario, population, field, classification, and dependency blockers", async () => {
    const fixture = await approvedFixture([
      ...defaultScenarioRules(),
      {
        id: "QPSA",
        label: "QPSA",
        triggerConditions: [
          {
            dimension: "benefit-purpose",
            operator: "equals",
            value: "normal",
            source: "plan-rule",
          },
          {
            dimension: "survivor-status",
            operator: "present",
            value: true,
            source: "population",
          },
        ],
        exclusionConditions: [],
        defaultEffectiveDateRange: { startDate: "1900-01-01", endDate: null },
      },
    ]);
    const binding = fixture.population.candidates[0];
    if (binding === undefined) throw new Error("Missing population fixture.");
    const primary = binding.workbook.sheets[0];
    if (primary === undefined) throw new Error("Missing workbook fixture.");
    const result = await buildArchitecture({
      ...fixture,
      population: {
        candidates: [
          {
            ...binding,
            workbook: {
              ...binding.workbook,
              sheets: [
                {
                  ...primary,
                  cells: [
                    ...primary.cells,
                    observedCell("C2", 1, "='Missing Sheet'!A1"),
                  ],
                },
                {
                  name: "Other Synthetic Retirees",
                  hidden: false,
                  cells: [
                    {
                      ...observedCell("A1", "DOB", null),
                      sheet: "Other Synthetic Retirees",
                    },
                  ],
                },
                ...binding.workbook.sheets.slice(1),
              ],
            },
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.error.code !== "ARCHITECTURE_BLOCKED") return;
    const scopes = result.error.unresolvedItems.map(
      (item) => item.affectedScope,
    );
    expect(scopes.some((scope) => scope.includes("scenario/QPSA"))).toBe(true);
    expect(
      scopes.some((scope) => scope.includes("Other Synthetic Retirees")),
    ).toBe(true);
    expect(scopes.some((scope) => scope.includes("cell:C2"))).toBe(true);
    expect(
      result.error.unresolvedItems.some(
        (item) =>
          item.kind === "missing-sequencing" &&
          item.affectedScope.includes("C2"),
      ),
    ).toBe(true);
  });
});

async function approvedFixture(
  scenarioRules: readonly ScenarioSelectionRule[] = defaultScenarioRules(),
) {
  const catalog = await evidenceCatalog();
  const ruleResult = await authorRule(
    {
      proposedCandidates: [await candidate("Normal retirement applies.")],
      primaryCitation: citation,
      catalog,
      unresolvedRecords: [],
      authorityOverrides: [],
      governingRestatement: "Normal retirement applies.",
      effectiveDate: "2020-01-01",
      endDate: null,
      applicabilityConditions: [
        { dimension: "benefit-purpose", value: "normal", evidence: [citation] },
      ],
      requiredApplicabilityDimensions: ["benefit-purpose"],
      affectedScope: "scenario/normal",
      reviewer: human,
      approvalRationale: "Approved synthetic architecture integration fixture.",
      confidence: 1,
      ruleSetVersion: "1.0.0",
    },
    { uuid: () => "00000000-0000-4000-8000-000000000406", now: () => builtAt },
  );
  if (!ruleResult.ok) throw new Error(ruleResult.error.message);

  const controlContent = {
    controlId: "00000000-0000-4000-8000-000000000407" as Uuid,
    dimensions: {},
    effectiveDateRange: { startDate: "2020-01-01", endDate: null },
    reviewStatus: "human-approved" as const,
    approvedBy: "Synthetic Reviewer",
    approvalRationale: "Approved synthetic architecture controls.",
  };
  const caseControls: AuthenticatedCaseControls = {
    ...controlContent,
    caseControlContentSha256: await caseControlContentHash(controlContent),
  };
  const policies = approvedPolicies(scenarioRules);
  const populationArtifact = catalog.caseEvidence[0];
  if (populationArtifact === undefined)
    throw new Error("Synthetic catalog has no released case evidence.");
  const observation = await createPopulationEvidenceObservation({
    citationId: "synthetic-population-observation",
    artifactSha256: populationArtifact.sha256,
    sourceLocator: "synthetic/workbook#Synthetic Retirees",
    evidenceKind: "population-characteristic",
    observedTextOrValue: {
      dimension: "participant-group",
      value: "synthetic-retirees",
    },
  });
  const populationCandidate = await createPopulationCandidate({
    artifactSha256: populationArtifact.sha256,
    candidateStatus: "proposed",
    detectorIdentity: "synthetic-test",
    detectorVersion: "1.0.0",
    confidence: 1,
    evidence: [observation],
    observedFields: ["DOB", "BSEX"],
    recordCounts: [2],
    sensitivity: "synthetic-mock",
    correctionsOrImputationsApplied: false,
  });
  const workbook = {
    status: "profiled" as const,
    sheets: [
      {
        name: "Synthetic Retirees",
        hidden: false,
        cells: [
          observedCell("A1", "DOB", null),
          observedCell("B1", "BSEX", null),
          observedCell("A2", "synthetic-participant-value", null),
          observedCell("B2", 1, "=A1"),
        ],
      },
      {
        name: "Tables",
        hidden: false,
        cells: [
          supportCell("A1", "Freeze Date", null),
          supportCell("B1", "Benefit Factor", null),
          supportCell("B2", 1, "=A1"),
        ],
      },
    ],
    formulaExecutionCount: 0 as const,
    limitations: [],
  };
  const namedRanges = [
    {
      name: "Birth_Date",
      cellAddress: "A1",
      sourceTab: "Synthetic Retirees",
      definitionSheet: null,
    },
    {
      name: "Freeze_Date",
      cellAddress: "A1",
      sourceTab: "Tables",
      definitionSheet: null,
    },
  ];
  const workbookProfileSha256 = await workbookProfileContentHash(
    workbook,
    namedRanges,
  );
  const decisionWithoutHash = {
    decisionId: "00000000-0000-4000-8000-000000000409",
    appendOrdinal: 1,
    priorDecisionId: null,
    priorDecisionContentSha256: null,
    candidateKey: populationCandidate.candidateKey,
    artifactSha256: populationCandidate.artifactSha256,
    workbookProfileContentSha256: workbookProfileSha256,
    decisionType: "approve" as const,
    humanActor: populationHuman,
    rationale: "Approved synthetic population evidence.",
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
          namedRanges,
        },
      ],
    },
    caseControls,
    policies,
    policyApprovals: { evidenceCatalog: catalog, decisions: policyDecisions },
    dependencies: { uuid: () => architectureId, now: () => builtAt },
  };
}

function observedCell(
  address: string,
  storedValue: string | number,
  formulaText: string | null,
) {
  return {
    sheet: "Synthetic Retirees",
    address,
    storedValue,
    formulaText,
    cellType: "s",
    kind: formulaText === null ? ("text" as const) : ("formula-text" as const),
  };
}

function supportCell(
  address: string,
  storedValue: string | number,
  formulaText: string | null,
) {
  return {
    ...observedCell(address, storedValue, formulaText),
    sheet: "Tables",
  };
}

function defaultScenarioRules(): readonly ScenarioSelectionRule[] {
  return [
    {
      id: "NRD",
      label: "Normal retirement date",
      triggerConditions: [
        {
          dimension: "benefit-purpose",
          operator: "equals" as const,
          value: "normal",
          source: "plan-rule" as const,
        },
      ],
      exclusionConditions: [],
      defaultEffectiveDateRange: { startDate: "1900-01-01", endDate: null },
    },
  ];
}

function approvedPolicies(
  scenarioRules: readonly ScenarioSelectionRule[],
): LoadedRuleSets {
  return {
    scenarioSelection: approve({
      kind: "scenario-selection",
      rules: scenarioRules,
    }),
    tabSelection: approve({
      kind: "tab-selection",
      rules: [
        {
          tabPattern: "Synthetic Retirees",
          requiredFields: ["DOB", "BSEX"],
          populationRequirement: "synthetic-retirees",
          description: "Synthetic retirees",
        },
      ],
    }),
    iobClassification: approve({
      kind: "iob-classification",
      rules: [
        {
          fieldPattern: "*",
          runPattern: "*",
          iob: "I",
          priority: 1,
          justification: "Approved synthetic input classification.",
        },
      ],
    }),
    fieldNameGlossary: approve({
      kind: "field-name-glossary",
      entries: [
        glossary("DOB", "DOB"),
        glossary("BSEX", "BSEX"),
        glossary("Birth_Date", "DOB"),
        glossary("Freeze Date", "FREEZE_DATE"),
        glossary("Freeze_Date", "FREEZE_DATE"),
        glossary("Benefit Factor", "BENEFIT_FACTOR"),
      ],
    }),
  };
}

function glossary(workbookPattern: string, genericField: string) {
  return {
    workbookPattern,
    genericField,
    description: `Synthetic ${genericField}`,
    tabContext: null,
  };
}

function approve<T extends Pick<RuleSet, "kind"> & Partial<RuleSet>>(
  payload: T,
): Extract<RuleSet, { kind: T["kind"] }> {
  const candidate = {
    ...payload,
    version: "1.0.0",
    policyContentSha256: hash("pending"),
    sourceFileSha256: hash(`${payload.kind} source`),
    governance: {
      reviewStatus: "provisional" as const,
    },
  } as RuleSet;
  const contentHash = policyContentHash(candidate);
  return {
    ...candidate,
    policyContentSha256: contentHash,
  } as unknown as Extract<RuleSet, { kind: T["kind"] }>;
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

import type {
  V1Architecture,
  V1ArchitectureContent,
} from "../../src/domain/architecture/models";
import { computeArchitectureContentSha256 } from "../../src/domain/architecture/workspace-adapter";
import { buildArchitecture } from "../../src/domain/architecture/architecture-builder";
import { formulaApprovalContentHash } from "../../src/domain/build-spec/formula-approval";
import type { FormulaGovernanceInput } from "../../src/domain/build-spec/models";
import type { PlanRuleRecord } from "../../src/domain/plan-rules/models";
import type { Sha256, UtcTimestamp, Uuid } from "../../src/domain/shared/types";

export const uuid = (suffix: string) =>
  `00000000-0000-1000-8000-${suffix.padStart(12, "0")}` as Uuid;
export const hash = (character: string) => character.repeat(64) as Sha256;
export const timestamp = "2026-07-28T12:00:00Z" as UtcTimestamp;

export function governedPlanRule(): PlanRuleRecord {
  const citation = {
    artifactSha256: hash("a"),
    artifactLocator: "synthetic/plan.txt",
    sourceRole: "executed-plan-document" as const,
    provisionIdentifier: "4.2",
    citationLocator: "Section 4.2",
  };
  return {
    ruleId: uuid("101"),
    governingRestatement: "Synthetic benefit formula rule.",
    affectedScope: "Synthetic DOR scenario",
    primaryCitation: citation,
    supportingCitations: [],
    effectiveDate: "2000-01-01",
    endDate: null,
    adoptionOrExecutionDate: "1999-12-15",
    applicabilityConditions: [
      { dimension: "benefit-purpose", value: "DOR", evidence: [citation] },
    ],
    supersessionChain: [
      {
        ordinal: 1,
        predecessorRuleId: null,
        predecessorRuleContentSha256: null,
        effectiveDate: "2000-01-01",
        linkType: "initial",
      },
    ],
    confidence: 1,
    authorityOverrideId: null,
    authorHuman: {
      actorType: "human",
      actorKey: "synthetic-reviewer",
      displayName: "Synthetic Reviewer",
      authorityContext: "Test fixture only",
    },
    authoredAt: timestamp,
    reviewStatus: "human-approved",
    approvalRationale: "Synthetic governed fixture.",
    linkedUnresolvedItemIds: [],
    ruleSetVersion: "synthetic-rules-v1",
    schemaVersion: "1.0.0",
    ruleContentSha256: hash("b"),
  };
}

export function createGovernedArchitecture(
  rule: PlanRuleRecord = governedPlanRule(),
): V1Architecture {
  const candidateKey = hash("c");
  const artifactSha256 = hash("d");
  const workbookProfileContentSha256 = hash("e");
  const runId = "DOR";
  const classification = (iob: "I" | "O" | "B", justification: string) =>
    new Map([
      [
        runId,
        { runId, iob, justification, ruleVersion: "synthetic-policy-v1" },
      ],
    ]);
  const content: V1ArchitectureContent = {
    caseId: uuid("2"),
    schemaVersion: "1.0.0",
    ruleSetVersion: "synthetic-policy-v1",
    lineage: {
      policies: (
        [
          "scenario-selection",
          "tab-selection",
          "iob-classification",
          "field-name-glossary",
        ] as const
      ).map((policyKind, index) => ({
        policyKind,
        policyVersion:
          policyKind === "scenario-selection" ||
          policyKind === "iob-classification"
            ? "synthetic-policy-v1"
            : "1.0.0",
        policyContentSha256: hash(String(index + 1)),
        sourceFileSha256: hash(String(index + 5)),
        approvalDecisionId: uuid(String(20 + index)),
        approvalDecisionContentSha256: hash(["a", "b", "c", "d"][index] ?? "a"),
      })),
      evidenceCatalogId: uuid("30"),
      evidenceCatalogContentSha256: hash("a"),
      population: [
        {
          candidateKey,
          artifactSha256,
          workbookProfileContentSha256,
          approvalDecisionId: "population-approval-1",
          approvalDecisionContentSha256: hash("f"),
        },
      ],
      caseControls: [{ controlId: uuid("31"), contentSha256: hash("9") }],
      authorityOverrides: [],
    },
    sourceTabs: [
      {
        tabName: "RETIREES",
        role: "population",
        workbookProfileContentSha256,
        populationCandidateKey: candidateKey,
        populationArtifactSha256: artifactSha256,
        fieldCount: 3,
        recordCount: 2,
      },
    ],
    runs: [
      {
        runId,
        runLabel: "Synthetic DOR",
        effectiveDateRange: { startDate: "2000-01-01", endDate: null },
        justifications: [
          {
            source: "plan-rule",
            referenceId: rule.ruleId,
            referenceContentSha256: rule.ruleContentSha256,
          },
        ],
        applicableTabs: ["RETIREES"],
      },
    ],
    cells: new Map([
      [
        "RETIREES::A1",
        {
          key: "RETIREES::A1",
          sourceTab: "RETIREES",
          cellAddress: "A1",
          genericField: "COMP",
          description: "Synthetic compensation input",
          hasFormula: false,
          formulaText: null,
          perRunClassification: classification(
            "I",
            "Observed population input",
          ),
        },
      ],
      [
        "RETIREES::C1",
        {
          key: "RETIREES::C1",
          sourceTab: "RETIREES",
          cellAddress: "C1",
          genericField: "SUBTOTAL",
          description: "Synthetic subtotal",
          hasFormula: true,
          formulaText: "=A1*0.01",
          perRunClassification: classification(
            "O",
            "Observed calculated output",
          ),
        },
      ],
      [
        "RETIREES::D1",
        {
          key: "RETIREES::D1",
          sourceTab: "RETIREES",
          cellAddress: "D1",
          genericField: "BENEFIT",
          description: "Synthetic governed benefit",
          hasFormula: true,
          formulaText: "=C1*2",
          perRunClassification: classification(
            "B",
            "Observed input and calculated output",
          ),
        },
      ],
    ]),
    formulaDependencies: [
      {
        dependentKey: "RETIREES::D1",
        dependencyKey: "RETIREES::C1",
        runId,
        referenceType: "cell",
      },
    ],
    namedRanges: [
      {
        name: "COMP",
        cellAddress: "A1",
        sourceTab: "RETIREES",
        scope: "workbook",
        genericField: "COMP",
      },
      {
        name: "SUBTOTAL",
        cellAddress: "C1",
        sourceTab: "RETIREES",
        scope: "sheet",
        genericField: null,
      },
    ],
  };
  return {
    architectureId: uuid("1"),
    builtAt: timestamp,
    ...content,
    architectureContentSha256: computeArchitectureContentSha256(content),
  };
}

export async function formulaGovernance(
  rule: PlanRuleRecord = governedPlanRule(),
): Promise<FormulaGovernanceInput> {
  const entry = async (
    cellKey: string,
    formulaText: string,
    iob: "O" | "B",
  ) => {
    const content = {
      decisionId: uuid(cellKey.endsWith("C1") ? "701" : "702"),
      appendOrdinal: 1,
      priorDecisionId: null,
      priorDecisionContentSha256: null,
      decisionType: "approve" as const,
      resultingStatus: "approved" as const,
      formulaText,
      target: {
        tabName: "RETIREES",
        cellAddress: cellKey.split("::")[1] ?? "C1",
        genericField: cellKey.endsWith("C1") ? "SUBTOTAL" : "BENEFIT",
      },
      scenarioId: "DOR",
      iobClassification: iob,
      sourcePlanRules: [
        {
          ruleId: rule.ruleId,
          ruleContentSha256: rule.ruleContentSha256,
          relationship: "governing" as const,
        },
      ],
      derivationDescription: `Reviewed derivation for ${cellKey}.`,
      affectedTestIds: [`TEST-${cellKey}`],
      regenerationImpact: "Regenerate compiler and workbook artifacts.",
      validationOracleIds: [`ORACLE-${cellKey}`],
      humanActor: rule.authorHuman,
      rationale: "Approved synthetic formula fixture.",
      decidedAt: timestamp,
      schemaVersion: "1.0.0" as const,
    };
    return {
      cellKey,
      scenarioId: "DOR",
      approvalDecisions: [
        {
          ...content,
          decisionContentSha256: await formulaApprovalContentHash(content),
        },
      ],
    };
  };
  return {
    approvedPlanRules: [rule],
    formulas: [
      await entry("RETIREES::C1", "=A1*0.01", "O"),
      await entry("RETIREES::D1", "=C1*2", "B"),
    ],
  };
}

export async function authenticatedGovernedInput(): Promise<{
  readonly architecture: V1Architecture;
  readonly architectureGovernance: import("../../src/domain/architecture/architecture-builder").ArchitectureGovernanceRecords;
  readonly formulaGovernance: FormulaGovernanceInput;
}> {
  const { approvedFixture } =
    await import("../integration/architecture-selection.test");
  const governed = await approvedFixture();
  const built = await buildArchitecture(governed);
  if (!built.ok) throw new Error(built.error.message);
  const { dependencies: ignored, ...architectureGovernance } = governed;
  void ignored;
  return {
    architecture: built.value.architecture,
    architectureGovernance,
    formulaGovernance: { approvedPlanRules: governed.planRules, formulas: [] },
  };
}

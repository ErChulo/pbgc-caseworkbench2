import type {
  BuildSpecV2,
  FormulaDefinitionV2,
  FormulaProvenance,
} from "../../src/domain/build-spec/models";
import { computeContentHash } from "../../src/domain/build-spec/serialization";
import type { ClockPort, UuidPort } from "../../src/domain/ports";
import type { Sha256, UtcTimestamp, Uuid } from "../../src/domain/shared/types";

const uuid = (suffix: string) =>
  `00000000-0000-1000-8000-${suffix.padStart(12, "0")}` as Uuid;
const hash = (character: string) => character.repeat(64) as Sha256;

export const fixedClock: ClockPort = {
  now: () => "2026-07-28T12:00:00Z" as UtcTimestamp,
};
export const fixedUuid: UuidPort = { generate: () => uuid("999") };

export function approvedProvenance(
  overrides: Partial<FormulaProvenance> = {},
): FormulaProvenance {
  return {
    sourcePlanRules: [
      {
        ruleId: uuid("101"),
        ruleContentSha256: hash("a"),
        relationship: "governing",
        citation: {
          artifactSha256: hash("b"),
          sourceRole: "executed-plan-document",
          locator: "Section 4.2(a)",
        },
        effectiveDate: "2000-01-01",
        endDate: null,
        adoptionOrExecutionDate: "1999-12-15",
        applicabilityConditions: [
          { dimension: "calculation-scenario", value: "DOR" },
        ],
        supersedesRuleId: null,
        confidence: 1,
        reviewStatus: "human-approved",
        authorityOverrideId: null,
        unresolvedItemIds: [],
      },
    ],
    derivationDescription: "Synthetic reviewed formula derivation.",
    approvalRecordId: "APPROVAL-SYNTHETIC-001",
    affectedTestIds: ["ORACLE-SYNTHETIC-001"],
    regenerationImpact:
      "Regenerate compiled formulas and dependent workbook artifacts.",
    validationOracleIds: ["ORACLE-SYNTHETIC-001"],
    ...overrides,
  };
}

export interface FormulaFixture {
  readonly id: string;
  readonly field: string;
  readonly cell: string;
  readonly text: string;
  readonly dependencies?: readonly string[];
  readonly provenance?: FormulaProvenance;
}

export async function buildSpecV2(
  formulaFixtures: readonly FormulaFixture[] = [
    {
      id: "FORMULA-RETIREES-SUBTOTAL-DOR",
      field: "SUBTOTAL",
      cell: "C1",
      text: "=COMP+YOS",
    },
    {
      id: "FORMULA-RETIREES-BENEFIT-DOR",
      field: "BENEFIT",
      cell: "D1",
      text: "=SUBTOTAL*0.01",
      dependencies: ["FORMULA-RETIREES-SUBTOTAL-DOR"],
    },
  ],
): Promise<BuildSpecV2> {
  const formulas: FormulaDefinitionV2[] = formulaFixtures.map((entry) => ({
    formulaId: entry.id,
    scenarioId: "DOR",
    tabName: "RETIREES",
    genericField: entry.field,
    formulaText: entry.text,
    cellAddress: entry.cell,
    dependencies: entry.dependencies ?? [],
    iobClassification: "O",
    justification: "Synthetic fixture",
    formulaKind: "scalar",
    provenance: entry.provenance ?? approvedProvenance(),
  }));
  const inputMappings = [
    {
      mappingId: uuid("201"),
      field: "COMP",
      tabName: "RETIREES",
      cellAddress: "A1",
      iobClassification: "I" as const,
      dataSource: {
        sourceType: "population" as const,
        sourceTab: "RETIREES",
        sourceField: "COMP",
        evidenceKey: null,
      },
      formulaId: null,
      scenarioId: "DOR",
    },
    {
      mappingId: uuid("202"),
      field: "YOS",
      tabName: "RETIREES",
      cellAddress: "B1",
      iobClassification: "I" as const,
      dataSource: {
        sourceType: "population" as const,
        sourceTab: "RETIREES",
        sourceField: "YOS",
        evidenceKey: null,
      },
      formulaId: null,
      scenarioId: "DOR",
    },
  ];
  const outputMappings = formulas.map((formula, index) => ({
    mappingId: uuid(String(300 + index)),
    field: formula.genericField,
    tabName: formula.tabName,
    cellAddress: formula.cellAddress,
    iobClassification: formula.iobClassification,
    dataSource: null,
    formulaId: formula.formulaId,
    scenarioId: formula.scenarioId,
  }));
  const initial: BuildSpecV2 = {
    schemaVersion: "2.0.0",
    buildSpecId: uuid("1"),
    architectureId: uuid("2"),
    caseId: uuid("3"),
    ruleSetVersion: "synthetic-v1",
    generatedAt: fixedClock.now(),
    formulas,
    namedRanges: [],
    cellMappings: [...inputMappings, ...outputMappings],
    executionOrder: {
      order: formulas.map((formula) => formula.formulaId),
      levelCount: formulas.length,
      maxDepth: Math.max(0, formulas.length - 1),
      hasCycles: false,
      cycleNodes: [],
    },
    validation: {
      isValid: true,
      errors: [],
      warnings: [],
      validatedAt: fixedClock.now(),
    },
    buildSpecContentSha256: hash("0"),
  };
  return {
    ...initial,
    buildSpecContentSha256: await computeContentHash(initial),
  };
}

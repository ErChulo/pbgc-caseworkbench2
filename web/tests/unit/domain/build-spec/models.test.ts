import { describe, it, expect } from "vitest";
import type {
  BuildSpec,
  FormulaDefinition,
  NamedRangeDefinition,
  CellMapping,
  ExecutionOrder,
  ValidationResult,
} from "../../../../src/domain/build-spec/models";
import { buildSpecSchemaVersion } from "../../../../src/domain/build-spec/models";
import type {
  Uuid,
  Sha256,
  UtcTimestamp,
} from "../../../../src/domain/shared/types";

describe("build-spec models", () => {
  it("exports buildSpecSchemaVersion as const", () => {
    expect(buildSpecSchemaVersion).toBe("1.0.0");
  });

  it("creates a valid FormulaDefinition", () => {
    const formula: FormulaDefinition = {
      formulaId: "FORMULA-RETIREES-BENEFIT-DOR",
      scenarioId: "DOR",
      tabName: "RETIREES",
      genericField: "BENEFIT",
      formulaText: "=COMP*YOS*0.01",
      cellAddress: "B2",
      dependencies: ["FORMULA-RETIREES-COMP-DOR"],
      iobClassification: "O",
      justification: "Benefit amount is a calculated result",
    };

    expect(formula.formulaId).toBe("FORMULA-RETIREES-BENEFIT-DOR");
    expect(formula.scenarioId).toBe("DOR");
    expect(formula.iobClassification).toBe("O");
    expect(formula.dependencies).toHaveLength(1);
  });

  it("creates a valid NamedRangeDefinition", () => {
    const range: NamedRangeDefinition = {
      rangeName: "BENEFIT",
      cellAddress: "B2",
      tabName: "RETIREES",
      scope: "workbook",
      genericField: "BENEFIT",
      scenarioId: "DOR",
      provenance: {
        source: "architecture",
        architectureNamedRange: "BENEFIT",
      },
    };

    expect(range.rangeName).toBe("BENEFIT");
    expect(range.scope).toBe("workbook");
    expect(range.provenance.source).toBe("architecture");
  });

  it("creates a valid CellMapping", () => {
    const mapping: CellMapping = {
      mappingId: "00000000-0000-1000-8000-000000000010" as Uuid,
      field: "BENEFIT",
      tabName: "RETIREES",
      cellAddress: "B2",
      iobClassification: "O",
      dataSource: null,
      formulaId: "FORMULA-RETIREES-BENEFIT-DOR",
      scenarioId: "DOR",
    };

    expect(mapping.field).toBe("BENEFIT");
    expect(mapping.iobClassification).toBe("O");
    expect(mapping.dataSource).toBeNull();
    expect(mapping.formulaId).toBe("FORMULA-RETIREES-BENEFIT-DOR");
  });

  it("creates a valid ExecutionOrder", () => {
    const order: ExecutionOrder = {
      order: ["FORMULA-A", "FORMULA-B"],
      levelCount: 2,
      maxDepth: 1,
      hasCycles: false,
      cycleNodes: [],
    };

    expect(order.order).toHaveLength(2);
    expect(order.hasCycles).toBe(false);
    expect(order.cycleNodes).toHaveLength(0);
  });

  it("creates a valid ValidationResult", () => {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      validatedAt: "2026-07-28T12:00:00Z" as UtcTimestamp,
    };

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("creates a valid BuildSpec", () => {
    const buildSpec: BuildSpec = {
      schemaVersion: "1.0.0",
      buildSpecId: "00000000-0000-1000-8000-000000000001" as Uuid,
      architectureId: "00000000-0000-1000-8000-000000000002" as Uuid,
      caseId: "00000000-0000-1000-8000-000000000003" as Uuid,
      ruleSetVersion: "1.0.0",
      generatedAt: "2026-07-28T12:00:00Z" as UtcTimestamp,
      formulas: [],
      namedRanges: [],
      cellMappings: [],
      executionOrder: {
        order: [],
        levelCount: 0,
        maxDepth: 0,
        hasCycles: false,
        cycleNodes: [],
      },
      validation: {
        isValid: true,
        errors: [],
        warnings: [],
        validatedAt: "2026-07-28T12:00:01Z" as UtcTimestamp,
      },
      buildSpecContentSha256: "a".repeat(64) as Sha256,
    };

    expect(buildSpec.schemaVersion).toBe("1.0.0");
    expect(buildSpec.formulas).toHaveLength(0);
    expect(buildSpec.validation.isValid).toBe(true);
  });
});

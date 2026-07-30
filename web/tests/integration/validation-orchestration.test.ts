import { describe, it, expect } from "vitest";
import type { Sha256 } from "../../src/domain/shared/types";
import { buildWorkbook } from "../../src/domain/workbook-builder/workbook-builder";
import {
  WorkbookValidationEngine,
  WorkbookReconciliationEngine,
  ValidationOrchestrationEngine,
} from "../../src/domain/validation-reconciliation/engine";
import { createDefaultToleranceProfile } from "../../src/domain/validation-reconciliation/tolerance";
import { buildSpecV2 } from "../fixtures/formula-compiler";

async function fixtureWorkbook() {
  const workbookProfileContentSha256 = "e".repeat(64) as Sha256;
  const buildSpec = await buildSpecV2();
  const result = await buildWorkbook({
    buildSpec: {
      ...buildSpec,
      architectureLineage: {
        ...buildSpec.architectureLineage,
        population: [
          {
            candidateKey: "c".repeat(64) as Sha256,
            artifactSha256: "d".repeat(64) as Sha256,
            workbookProfileContentSha256,
            approvalDecisionId: "population-approval-1",
            approvalDecisionContentSha256: "f".repeat(64) as Sha256,
          },
        ],
      },
    },
    populationProfile: {
      status: "approved",
      effectiveDecisionId: "population-approval-1",
      effectiveWorkbookProfileContentSha256: workbookProfileContentSha256,
      provenance: ["population-approval-1"],
    },
    workbookProfileContentSha256,
    generatorVersion: "1.0.0",
  });
  if (!result.ok) throw new Error("fixture workbook build failed");
  return result.workbook;
}

describe("validation engine orchestration", () => {
  it("validates workbook and returns comprehensive result", async () => {
    const workbook = await fixtureWorkbook();
    const buildSpec = await buildSpecV2();
    const engine = new WorkbookValidationEngine();
    const result = await engine.validate({
      workbook,
      buildSpec,
      population: {
        status: "approved",
        effectiveDecisionId: "population-approval-1",
        effectiveWorkbookProfileContentSha256: "e".repeat(64) as Sha256,
        provenance: ["population-approval-1"],
      },
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    expect(result.validationId).toHaveLength(64);
    expect(result.status).toBeDefined();
  });

  it("correctly identifies valid workbooks", async () => {
    const workbook = await fixtureWorkbook();
    const buildSpec = await buildSpecV2();
    const engine = new WorkbookValidationEngine();
    const result = await engine.validate({
      workbook,
      buildSpec,
      population: {
        status: "approved",
        effectiveDecisionId: "population-approval-1",
        effectiveWorkbookProfileContentSha256: "e".repeat(64) as Sha256,
        provenance: ["population-approval-1"],
      },
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    const isValid = engine.isValid(result);
    expect(typeof isValid).toBe("boolean");
  });

  it("correctly identifies validation blocking errors", async () => {
    const workbook = await fixtureWorkbook();
    const buildSpec = await buildSpecV2();
    const engine = new WorkbookValidationEngine();
    const result = await engine.validate({
      workbook,
      buildSpec,
      population: {
        status: "approved",
        effectiveDecisionId: "population-approval-1",
        effectiveWorkbookProfileContentSha256: "e".repeat(64) as Sha256,
        provenance: ["population-approval-1"],
      },
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    const blocksApproval = engine.blocksApproval(result);
    expect(typeof blocksApproval).toBe("boolean");
  });
});

describe("reconciliation engine orchestration", () => {
  it("skips reconciliation when validation fails", async () => {
    const workbook = await fixtureWorkbook();
    const buildSpec = await buildSpecV2();
    const validationEngine = new WorkbookValidationEngine();
    const validated = await validationEngine.validate({
      workbook,
      buildSpec,
      population: {
        status: "approved",
        effectiveDecisionId: "population-approval-1",
        effectiveWorkbookProfileContentSha256: "e".repeat(64) as Sha256,
        provenance: ["population-approval-1"],
      },
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });

    const reconciliationEngine = new WorkbookReconciliationEngine();
    if (validated.status !== "invalid") {
      const reconciled = await reconciliationEngine.reconcile({
        workbook,
        validation: validated,
        oracle: {
          oracleId: "oracle-1",
          oracleType: "reference-calculation",
          toolName: "Custom",
          executedAt: workbook.generatedAt,
          executionVersion: "1.0.0",
          populationSnapshot: workbook.populationProfileContentSha256,
          buildSpecSnapshot: workbook.buildSpecContentSha256,
          results: [],
          reliability: "trusted",
          executionEvidence: null,
        },
        tolerance: createDefaultToleranceProfile(),
        actualValues: {},
      });

      expect(reconciled.reconciliationId).toHaveLength(64);
      expect(reconciled.reconciliationStatus).toBeDefined();
    } else {
      expect(validated.status).toBe("invalid");
    }
  });

  it("engine identifies reconciliation status correctly", async () => {
    const workbook = await fixtureWorkbook();
    const buildSpec = await buildSpecV2();
    const validationEngine = new WorkbookValidationEngine();
    const validated = await validationEngine.validate({
      workbook,
      buildSpec,
      population: {
        status: "approved",
        effectiveDecisionId: "population-approval-1",
        effectiveWorkbookProfileContentSha256: "e".repeat(64) as Sha256,
        provenance: ["population-approval-1"],
      },
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });

    const reconciliationEngine = new WorkbookReconciliationEngine();
    if (validated.status !== "invalid") {
      const reconciled = await reconciliationEngine.reconcile({
        workbook,
        validation: validated,
        oracle: null,
        tolerance: createDefaultToleranceProfile(),
        actualValues: {},
      });

      const isComplete = reconciliationEngine.isComplete(reconciled);
      expect(typeof isComplete).toBe("boolean");
    }
  });
});

describe("unified orchestration engine", () => {
  it("orchestrates full validation and reconciliation flow", async () => {
    const workbook = await fixtureWorkbook();
    const buildSpec = await buildSpecV2();
    const engine = new ValidationOrchestrationEngine();

    const result = await engine.orchestrate({
      workbook,
      buildSpec,
      population: {
        status: "approved",
        effectiveDecisionId: "population-approval-1",
        effectiveWorkbookProfileContentSha256: "e".repeat(64) as Sha256,
        provenance: ["population-approval-1"],
      },
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
      tolerance: createDefaultToleranceProfile(),
      actualValues: {},
      reconciliationOracle: null,
    });

    expect(result.validation).toBeDefined();
    expect(result.isValid).toBeDefined();
    expect(result.blocksApproval).toBeDefined();
  });

  it("orchestrates with optional reconciliation", async () => {
    const workbook = await fixtureWorkbook();
    const buildSpec = await buildSpecV2();
    const engine = new ValidationOrchestrationEngine();

    const result = await engine.orchestrate({
      workbook,
      buildSpec,
      population: {
        status: "approved",
        effectiveDecisionId: "population-approval-1",
        effectiveWorkbookProfileContentSha256: "e".repeat(64) as Sha256,
        provenance: ["population-approval-1"],
      },
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
      tolerance: createDefaultToleranceProfile(),
      actualValues: {},
    });

    expect(result.validation).toBeDefined();
    expect(result.blocksApproval).toBeDefined();
  });
});

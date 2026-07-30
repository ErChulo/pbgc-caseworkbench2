import { describe, expect, it } from "vitest";
import type { Sha256 } from "../../../../src/domain/shared/types";
import { buildWorkbook } from "../../../../src/domain/workbook-builder/workbook-builder";
import { validateWorkbook } from "../../../../src/domain/validation-reconciliation/structural-validator";
import { reconcileWorkbook } from "../../../../src/domain/validation-reconciliation/formula-reconciler";
import { buildSpecV2 } from "../../../fixtures/formula-compiler";

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

describe("validation-reconciliation core", () => {
  it("validates workbook deterministically", async () => {
    const workbook = await fixtureWorkbook();
    const validated = await validateWorkbook({
      workbook,
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    expect(validated.status).toBe("invalid");
    expect(validated.validationId).toHaveLength(64);
  });

  it("reconciles generic oracle results deterministically", async () => {
    const workbook = await fixtureWorkbook();
    const validation = await validateWorkbook({
      workbook,
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    const reconciled = await reconcileWorkbook({
      workbook,
      validation,
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
      tolerance: {
        profileId: "default",
        absoluteTolerance: 0.01,
        relativeTolerance: 0.001,
        roundingMethod: "banker's",
        effectiveDate: "2026-01-01",
        cellLevelOverrides: {},
      },
      actualValues: {},
    });
    expect(reconciled.reconciliationStatus).toBe("complete");
    expect(reconciled.reconciliationId).toHaveLength(64);
  });
});

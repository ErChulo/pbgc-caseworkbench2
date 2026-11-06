import { describe, it, expect } from "vitest";
import type { Sha256 } from "../../../../src/domain/shared/types";
import { buildWorkbook } from "../../../../src/domain/workbook-builder/workbook-builder";
import { validateWorkbook } from "../../../../src/domain/validation-reconciliation/structural-validator";
import { reconcileWorkbook } from "../../../../src/domain/validation-reconciliation/formula-reconciler";
import {
  generateValidationEvidence,
  generateReconciliationEvidence,
  recordHumanReview,
  generateValidationSummary,
  generateReconciliationSummary,
} from "../../../../src/domain/validation-reconciliation/evidence-generation";
import { createDefaultToleranceProfile } from "../../../../src/domain/validation-reconciliation/tolerance";
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

describe("evidence generation", () => {
  it("generates validation evidence deterministically", async () => {
    const workbook = await fixtureWorkbook();
    const validated = await validateWorkbook({
      workbook,
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    const evidence1 = await generateValidationEvidence(validated);
    const evidence2 = await generateValidationEvidence(validated);
    expect(evidence1.hash).toBe(evidence2.hash);
    const evidence = JSON.parse(evidence1.evidence) as Record<string, unknown>;
    expect(evidence.workbookContentSha256).toBe(workbook.workbookContentSha256);
    expect(evidence.buildSpecContentSha256).toBe(
      workbook.buildSpecContentSha256,
    );
    expect(evidence.validatorVersion).toBe("1.0.0");
  });

  it("generates reconciliation evidence with oracle results", async () => {
    const workbook = await fixtureWorkbook();
    const validated = await validateWorkbook({
      workbook,
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    const tolerance = createDefaultToleranceProfile();
    const reconciled = await reconcileWorkbook({
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
      tolerance,
      actualValues: {},
    });
    const evidence = await generateReconciliationEvidence(reconciled);
    expect(evidence.hash).toHaveLength(64);
    expect(JSON.parse(evidence.evidence)).toHaveProperty("reconciliationId");
    await expect(
      generateReconciliationEvidence({ ...reconciled, matchCount: 42 }),
    ).rejects.toThrow("integrity verification");
    const body = JSON.parse(evidence.evidence) as Record<string, unknown>;
    expect(body).toHaveProperty(
      "oracleContentSha256",
      reconciled.oracleContentSha256,
    );
    expect(body).toHaveProperty(
      "actualValuesContentSha256",
      reconciled.actualValuesContentSha256,
    );
    expect(body).toHaveProperty("tolerance", reconciled.tolerance);
  });

  it("records human review on reconciliation results", async () => {
    const workbook = await fixtureWorkbook();
    const validated = await validateWorkbook({
      workbook,
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    const tolerance = createDefaultToleranceProfile();
    const reconciled = await reconcileWorkbook({
      workbook,
      validation: validated,
      oracle: null,
      tolerance,
      actualValues: {},
    });
    const reviewed = await recordHumanReview(
      reconciled,
      "reviewer@example.com",
      "Approved for production.",
    );
    expect(reviewed.reviewedBy).toBe("reviewer@example.com");
    expect(reviewed.reviewRationale).toBe("Approved for production.");
    expect(reviewed.reconciliationStatus).toBe("oracle-unavailable");
    await expect(
      recordHumanReview(reviewed, "reviewer", "replacement"),
    ).rejects.toThrow("review history");
    await expect(
      generateReconciliationEvidence({
        ...reconciled,
        oracleContentSha256: undefined,
      } as unknown as typeof reconciled),
    ).rejects.toThrow("integrity verification");
    expect(reviewed.reconciliationContentSha256).not.toBe(
      reconciled.reconciliationContentSha256,
    );
    expect(reviewed.reconciliationId).toBe(
      reviewed.reconciliationContentSha256,
    );
    await expect(
      recordHumanReview(reconciled, " ", "rationale"),
    ).rejects.toThrow();
    await expect(
      recordHumanReview(reconciled, "reviewer", " "),
    ).rejects.toThrow();
    await expect(
      recordHumanReview(
        { ...reconciled, matchCount: 42 },
        "reviewer",
        "reviewed",
      ),
    ).rejects.toThrow("integrity verification");
  });

  it("generates validation summary text", async () => {
    const workbook = await fixtureWorkbook();
    const validated = await validateWorkbook({
      workbook,
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    const summary = generateValidationSummary(validated);
    expect(summary).toContain("Validation ID:");
    expect(summary).toContain("Status:");
    expect(summary).toContain("Errors:");
  });

  it("generates reconciliation summary text", async () => {
    const workbook = await fixtureWorkbook();
    const validated = await validateWorkbook({
      workbook,
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    const tolerance = createDefaultToleranceProfile();
    const reconciled = await reconcileWorkbook({
      workbook,
      validation: validated,
      oracle: null,
      tolerance,
      actualValues: {},
    });
    const summary = generateReconciliationSummary(reconciled);
    expect(summary).toContain("Reconciliation ID:");
    expect(summary).toContain("Status:");
    expect(summary).toContain("Results:");
  });
});

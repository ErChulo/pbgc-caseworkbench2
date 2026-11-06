import { hashTyped } from "../manifests/canonical-json";
import { parseSha256, type Sha256 } from "../shared/types";
import type {
  ValidationResult,
  ReconciliationResult,
  ReconciliationMismatch,
} from "./models";

export interface ValidationEvidenceMetadata {
  readonly validatedAt: string;
  readonly validationType: ValidationResult["validationType"];
  readonly validationId: Sha256;
}

export interface ReconciliationEvidenceMetadata {
  readonly reconciliationId: string;
  readonly validationId: string;
  readonly oracleId: string;
  readonly oracleExecutedAt: string;
  readonly reviewedBy: string | null;
  readonly reviewRationale: string | null;
  readonly reconciliationStatus: ReconciliationResult["reconciliationStatus"];
}

export async function generateValidationEvidence(
  result: ValidationResult,
): Promise<{ readonly evidence: string; readonly hash: Sha256 }> {
  const evidence = {
    validationId: result.validationId,
    validationType: result.validationType,
    ...(result.validationType === "workbook" &&
    "workbookContentSha256" in result
      ? {
          workbookContentSha256: result.workbookContentSha256,
          buildSpecContentSha256:
            "buildSpecContentSha256" in result
              ? result.buildSpecContentSha256
              : null,
          architectureContentSha256:
            "architectureContentSha256" in result
              ? result.architectureContentSha256
              : null,
          populationProfileContentSha256:
            "populationProfileContentSha256" in result
              ? result.populationProfileContentSha256
              : null,
          validatorVersion:
            "validatorVersion" in result ? result.validatorVersion : null,
        }
      : {}),
    status: result.status,
    validatedAt: result.validatedAt,
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
    errors: sortFindingsByCode(result.errors),
    warnings: sortFindingsByCode(result.warnings),
  };

  const hash = (await hashTyped(evidence, {
    typeName: "ValidationEvidence",
  })) as Sha256;

  return {
    evidence: JSON.stringify(evidence),
    hash,
  };
}

export async function generateReconciliationEvidence(
  suppliedResult: ReconciliationResult,
): Promise<{ readonly evidence: string; readonly hash: Sha256 }> {
  const result = structuredClone(suppliedResult);
  await requireReconciliationIntegrity(result);
  const evidence = {
    reconciliationId: result.reconciliationId,
    validationId: result.validationId,
    oracleId: result.oracleId,
    oracleContentSha256: result.oracleContentSha256,
    actualValuesContentSha256: result.actualValuesContentSha256,
    reconciliationStatus: result.reconciliationStatus,
    oracleExecutedAt: result.oracleExecutedAt,
    matchCount: result.matchCount,
    mismatchCount: result.mismatchCount,
    errorCount: result.errorCount,
    tolerance: result.tolerance,
    mismatches: sortMismatchesByFormula(result.mismatches),
    reviewMetadata: {
      reviewedBy: result.reviewedBy,
      reviewRationale: result.reviewRationale,
    },
  };

  const hash = (await hashTyped(evidence, {
    typeName: "ReconciliationEvidence",
  })) as Sha256;

  return {
    evidence: JSON.stringify(evidence),
    hash,
  };
}

/** Records a review note; it does not change reconciliation status or approve output. */
export async function recordHumanReview(
  suppliedResult: ReconciliationResult,
  reviewedBy: string,
  rationale: string,
): Promise<ReconciliationResult> {
  const result = structuredClone(suppliedResult);
  if (!reviewedBy.trim() || !rationale.trim()) {
    throw new Error("A reviewer and rationale are required.");
  }
  await requireReconciliationIntegrity(result);
  if (result.reviewedBy !== null || result.reviewRationale !== null)
    throw new Error(
      "A review note already exists; a review history is required to change it.",
    );
  const reviewed = {
    workbookContentSha256: result.workbookContentSha256,
    validationId: result.validationId,
    oracleId: result.oracleId,
    oracleExecutedAt: result.oracleExecutedAt,
    oracleContentSha256: result.oracleContentSha256,
    actualValuesContentSha256: result.actualValuesContentSha256,
    reconciliationStatus: result.reconciliationStatus,
    mismatches: result.mismatches,
    tolerance: result.tolerance,
    matchCount: result.matchCount,
    mismatchCount: result.mismatchCount,
    errorCount: result.errorCount,
    reviewedBy: reviewedBy.trim(),
    reviewRationale: rationale.trim(),
  };
  const hash = (await hashTyped(reviewed, {
    typeName: "WorkbookReconciliationResult",
  })) as Sha256;
  return {
    reconciliationId: hash,
    ...reviewed,
    reconciliationContentSha256: hash,
  };
}

async function requireReconciliationIntegrity(
  result: ReconciliationResult,
): Promise<void> {
  try {
    const validDigest = (value: unknown) =>
      value === null || (typeof value === "string" && parseSha256(value).ok);
    if (
      !validDigest(result.oracleContentSha256) ||
      !validDigest(result.actualValuesContentSha256)
    )
      throw new Error("Invalid input digests.");
    if (
      result.reconciliationStatus === "complete" &&
      (result.oracleContentSha256 === null ||
        result.actualValuesContentSha256 === null)
    )
      throw new Error("Missing input digests.");
    const { reconciliationId, reconciliationContentSha256, ...content } =
      result;
    const hash = await hashTyped(content, {
      typeName: "WorkbookReconciliationResult",
    });
    if (hash !== reconciliationId || hash !== reconciliationContentSha256)
      throw new Error("Invalid hash.");
  } catch {
    throw new Error("Reconciliation content failed integrity verification.");
  }
}

export function generateValidationSummary(result: ValidationResult): string {
  const lines: string[] = [
    `Validation ID: ${result.validationId}`,
    `Type: ${result.validationType}`,
    `Status: ${result.status}`,
    `Validated at: ${result.validatedAt}`,
    "",
    `Errors: ${String(result.errors.length)}`,
    `Warnings: ${String(result.warnings.length)}`,
  ];

  if (result.errors.length > 0) {
    lines.push("", "Errors:");
    for (const error of result.errors.slice(0, 10)) {
      lines.push(`  [${error.code}] ${error.message}`);
    }
    if (result.errors.length > 10) {
      lines.push(`  ... and ${String(result.errors.length - 10)} more`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of result.warnings.slice(0, 10)) {
      lines.push(`  [${warning.code}] ${warning.message}`);
    }
    if (result.warnings.length > 10) {
      lines.push(`  ... and ${String(result.warnings.length - 10)} more`);
    }
  }

  return lines.join("\n");
}

export function generateReconciliationSummary(
  result: ReconciliationResult,
): string {
  const lines: string[] = [
    `Reconciliation ID: ${result.reconciliationId}`,
    `Validation ID: ${result.validationId}`,
    `Oracle ID: ${result.oracleId}`,
    `Status: ${result.reconciliationStatus}`,
    "",
    `Results: ${String(result.matchCount)} matches, ${String(result.mismatchCount)} mismatches, ${String(result.errorCount)} errors`,
    `Tolerance: ±${String(result.tolerance.absoluteTolerance)} (absolute), ±${String(result.tolerance.relativeTolerance * 100)}% (relative)`,
  ];

  if (result.reviewedBy) {
    lines.push(`Reviewed by: ${result.reviewedBy}`);
    if (result.reviewRationale) {
      lines.push(`Review rationale: ${result.reviewRationale}`);
    }
  }

  if (result.mismatches.length > 0) {
    lines.push("", "Mismatches:");
    for (const mismatch of result.mismatches.slice(0, 10)) {
      lines.push(
        `  ${mismatch.cellAddress} (${mismatch.formulaId}): expected ${String(mismatch.expectedValue)}, got ${String(mismatch.actualValue)}`,
      );
    }
    if (result.mismatches.length > 10) {
      lines.push(`  ... and ${String(result.mismatches.length - 10)} more`);
    }
  }

  return lines.join("\n");
}

function sortFindingsByCode<
  T extends { readonly code: string; readonly message: string },
>(findings: readonly T[]): T[] {
  return [...findings].sort(
    (a, b) =>
      a.code.localeCompare(b.code) || a.message.localeCompare(b.message),
  );
}

function sortMismatchesByFormula(
  mismatches: readonly ReconciliationMismatch[],
): ReconciliationMismatch[] {
  return [...mismatches].sort(
    (a, b) =>
      a.formulaId.localeCompare(b.formulaId) ||
      a.cellAddress.localeCompare(b.cellAddress),
  );
}

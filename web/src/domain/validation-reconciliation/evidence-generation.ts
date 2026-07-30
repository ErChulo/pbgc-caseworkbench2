import { hashTyped } from "../manifests/canonical-json";
import type { Sha256 } from "../shared/types";
import type {
  ValidationResult,
  ReconciliationResult,
  ReconciliationMismatch,
} from "./models";

export interface ValidationEvidenceMetadata {
  readonly validatorVersion: string;
  readonly validatedAt: string;
  readonly validator: string;
  readonly workbookContentSha256: Sha256;
  readonly buildSpecContentSha256: Sha256;
  readonly architectureContentSha256: Sha256;
  readonly populationProfileContentSha256: Sha256;
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
    status: result.status,
    validatedAt: result.validatedAt,
    validator: result.validator,
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
    errors: sortFindingsByCode(result.errors),
    warnings: sortFindingsByCode(result.warnings),
    metadata: {
      workbookContentSha256: result.workbookContentSha256,
      buildSpecContentSha256: result.buildSpecContentSha256,
      architectureContentSha256: result.architectureContentSha256,
      populationProfileContentSha256: result.populationProfileContentSha256,
    },
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
  result: ReconciliationResult,
): Promise<{ readonly evidence: string; readonly hash: Sha256 }> {
  const evidence = {
    reconciliationId: result.reconciliationId,
    validationId: result.validationId,
    oracleId: result.oracleId,
    reconciliationStatus: result.reconciliationStatus,
    oracleExecutedAt: result.oracleExecutedAt,
    matchCount: result.matchCount,
    mismatchCount: result.mismatchCount,
    errorCount: result.errorCount,
    tolerance: {
      profileId: result.tolerance.profileId,
      absoluteTolerance: result.tolerance.absoluteTolerance,
      relativeTolerance: result.tolerance.relativeTolerance,
    },
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

export function recordHumanReview(
  result: ReconciliationResult,
  reviewedBy: string,
  rationale: string,
): ReconciliationResult {
  return {
    ...result,
    reviewedBy,
    reviewRationale: rationale,
  };
}

export function generateValidationSummary(result: ValidationResult): string {
  const lines: string[] = [
    `Validation ID: ${result.validationId}`,
    `Status: ${result.status}`,
    `Validated at: ${result.validatedAt}`,
    `Validator: ${result.validator}`,
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

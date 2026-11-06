import { computeContentHash } from "../build-spec/serialization";
import { hashTyped } from "../manifests/canonical-json";
import type { Sha256 } from "../shared/types";
import type { V1Workbook } from "../workbook-builder/models";
import type { BuildSpecV2 } from "../build-spec/models";
import type { PopulationDecisionProjection } from "../population/population-profile";
import type { UtcTimestamp } from "../shared/types";
import type {
  ValidationResult,
  ReconciliationResult,
  ReconciliationInput,
  ReconciliationOracle,
  WorkbookValidationInput,
} from "./models";
import { validateWorkbook } from "./structural-validator";
import { reconcileWorkbook } from "./formula-reconciler";
import { evaluateOracleReliability } from "./oracle-integration";
import type { ToleranceProfile } from "./models";

export interface WorkbookValidationEngineInput {
  readonly workbook: V1Workbook;
  readonly buildSpec: BuildSpecV2;
  readonly population: PopulationDecisionProjection;
  readonly validatorVersion: string;
  readonly validatedAt: UtcTimestamp;
}

export interface WorkbookReconciliationEngineInput {
  readonly workbook: V1Workbook;
  readonly validation: ValidationResult;
  readonly tolerance: ToleranceProfile;
  readonly actualValues: Readonly<Record<string, unknown>>;
  readonly oracle: ReconciliationOracle | null;
}

export class WorkbookValidationEngine {
  async validate(
    suppliedInput: WorkbookValidationEngineInput,
  ): Promise<ValidationResult> {
    const input = structuredClone(suppliedInput);
    const validationInput: WorkbookValidationInput = {
      workbook: input.workbook,
      validatorVersion: input.validatorVersion,
      validatedAt: input.validatedAt,
    };

    const result = await validateWorkbook(validationInput);
    const { workbook, buildSpec, population } = input;
    let sourceValid = false;
    try {
      sourceValid =
        (await computeContentHash(buildSpec)) ===
          buildSpec.buildSpecContentSha256 &&
        buildSpec.buildSpecId === workbook.buildSpecId &&
        buildSpec.buildSpecContentSha256 === workbook.buildSpecContentSha256 &&
        buildSpec.architectureId === workbook.architectureId &&
        buildSpec.architectureContentSha256 ===
          workbook.architectureContentSha256 &&
        buildSpec.caseId === workbook.caseId &&
        buildSpec.validation.isValid &&
        population.status === "approved" &&
        !!population.effectiveDecisionId?.trim() &&
        population.effectiveDecisionId ===
          workbook.populationProfileDecisionId &&
        population.effectiveWorkbookProfileContentSha256 ===
          workbook.populationProfileContentSha256 &&
        buildSpec.architectureLineage.population.some(
          (entry) =>
            entry.workbookProfileContentSha256 ===
              workbook.populationProfileContentSha256 &&
            entry.approvalDecisionId === workbook.populationProfileDecisionId,
        );
    } catch {
      sourceValid = false;
    }
    if (sourceValid) return result;
    const finding = {
      code: "VALIDATION_SOURCE_LINEAGE_MISMATCH",
      severity: "error" as const,
      affectedCells: [],
      affectedNames: [],
      message:
        "The workbook does not match the supplied BuildSpec and approved population.",
      detail:
        "Recompute and verify BuildSpec content and population decision lineage before validation.",
      remediation:
        "Select the matching approved sources and regenerate the workbook.",
    };
    const errors = [...result.errors, finding].sort(
      (a, b) =>
        a.code.localeCompare(b.code) || a.message.localeCompare(b.message),
    );
    const {
      validationId: oldId,
      validationContentSha256: oldHash,
      validatedAt: timestamp,
      ...content
    } = result;
    void oldId;
    void oldHash;
    const payload = { ...content, status: "invalid" as const, errors };
    const hash = (await hashTyped(payload, {
      typeName: "WorkbookValidationResult",
    })) as Sha256;
    return {
      validationId: hash,
      ...payload,
      validatedAt: timestamp,
      validationContentSha256: hash,
    };
  }

  isValid(result: ValidationResult): boolean {
    return result.status === "valid" || result.status === "warnings";
  }

  blocksApproval(result: ValidationResult): boolean {
    return result.status === "invalid";
  }
}

export class WorkbookReconciliationEngine {
  async reconcile(input: ReconciliationInput): Promise<ReconciliationResult> {
    if (input.validation.status === "invalid") {
      throw new Error(
        "Cannot reconcile a workbook with validation errors. Resolve validation errors first.",
      );
    }

    const result = await reconcileWorkbook(input);

    if (input.oracle) {
      const reliabilityEval = evaluateOracleReliability(input.oracle);
      if (!reliabilityEval.isReliable) {
        console.warn(
          `Oracle reliability concerns detected: ${reliabilityEval.concerns.join("; ")}`,
        );
      }
    }

    return result;
  }

  isComplete(result: ReconciliationResult): boolean {
    return result.reconciliationStatus === "complete";
  }

  hasMismatches(result: ReconciliationResult): boolean {
    return result.mismatchCount > 0;
  }

  isBlocked(result: ReconciliationResult): boolean {
    return result.reconciliationStatus !== "complete";
  }
}

export interface ValidationOrchestrationResult {
  readonly validation: ValidationResult;
  readonly isValid: boolean;
  readonly blocksApproval: boolean;
  readonly reconciliation?: ReconciliationResult;
  readonly isReconciled?: boolean;
  readonly hasMismatches?: boolean;
}

export class ValidationOrchestrationEngine {
  private validationEngine = new WorkbookValidationEngine();
  private reconciliationEngine = new WorkbookReconciliationEngine();

  async orchestrate(
    input: WorkbookValidationEngineInput & {
      readonly tolerance?: ToleranceProfile;
      readonly actualValues?: Readonly<Record<string, unknown>>;
      readonly reconciliationOracle?: ReconciliationOracle | null;
    },
  ): Promise<ValidationOrchestrationResult> {
    const validation = await this.validationEngine.validate(input);
    const isValid = this.validationEngine.isValid(validation);
    const blocksApproval = this.validationEngine.blocksApproval(validation);

    if (isValid && input.tolerance && input.actualValues !== undefined) {
      try {
        const reconciliation = await this.reconciliationEngine.reconcile({
          workbook: input.workbook,
          validation,
          oracle: input.reconciliationOracle ?? null,
          tolerance: input.tolerance,
          actualValues: input.actualValues,
        });

        const isReconciled =
          this.reconciliationEngine.isComplete(reconciliation);
        const hasMismatches =
          this.reconciliationEngine.hasMismatches(reconciliation);

        return {
          validation,
          isValid,
          blocksApproval:
            blocksApproval ||
            this.reconciliationEngine.isBlocked(reconciliation),
          reconciliation,
          isReconciled,
          hasMismatches,
        };
      } catch (error) {
        console.error("Reconciliation failed:", error);
      }
    }

    return {
      validation,
      isValid,
      // Validation alone cannot establish reconciliation readiness.
      blocksApproval: true,
    };
  }
}

export async function validateWorkbookStructure(
  workbook: V1Workbook,
  buildSpec: BuildSpecV2,
  population: PopulationDecisionProjection,
  validatorVersion: string,
  validatedAt: UtcTimestamp,
): Promise<ValidationResult> {
  const engine = new WorkbookValidationEngine();
  return engine.validate({
    workbook,
    buildSpec,
    population,
    validatorVersion,
    validatedAt,
  });
}

export async function reconcileWorkbookResults(
  workbook: V1Workbook,
  validation: ValidationResult,
  tolerance: ToleranceProfile,
  actualValues: Readonly<Record<string, unknown>>,
): Promise<ReconciliationResult> {
  const engine = new WorkbookReconciliationEngine();
  return engine.reconcile({
    workbook,
    validation,
    oracle: null,
    tolerance,
    actualValues,
  });
}

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
    input: WorkbookValidationEngineInput,
  ): Promise<ValidationResult> {
    const validationInput: WorkbookValidationInput = {
      workbook: input.workbook,
      validatorVersion: input.validatorVersion,
      validatedAt: input.validatedAt,
    };

    const result = await validateWorkbook(validationInput);
    return result;
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
    return (
      result.reconciliationStatus === "oracle-unavailable" ||
      result.reconciliationStatus === "oracle-error"
    );
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
          blocksApproval,
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
      blocksApproval,
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

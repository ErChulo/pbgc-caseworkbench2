import { validateContract } from "../../contracts/schema-validator";
import {
  architectureToJsonValue,
  computeArchitectureContentSha256,
} from "../architecture/workspace-adapter";
import type {
  V1Architecture,
  V1ArchitectureContent,
} from "../architecture/models";
import {
  reauthenticateArchitecture,
  type ArchitectureGovernanceRecords,
} from "../architecture/architecture-builder";
import {
  validateRuleGovernance,
  validateRuleRecord,
} from "../plan-rules/rule-authoring";
import type { Sha256 } from "../shared/types";
import { generateCellMappings } from "./cell-mapper";
import { computeExecutionOrder } from "./execution-order";
import { generateFormulaDefinitions } from "./formula-mapper";
import { compareCodePoint, deterministicUuid } from "./identity";
import type {
  BuildSpecError,
  BuildSpecV2,
  FormulaGovernanceInput,
  ValidationError,
  ValidationResult,
} from "./models";
import { generateNamedRanges } from "./range-builder";
import {
  computeContentHash,
  deterministicBuildSpecIdentityPayload,
} from "./serialization";
import { validateBuildSpec } from "./validator";

export interface BuildSpecEngineConfig {
  readonly architecture: V1Architecture;
  readonly architectureGovernance: ArchitectureGovernanceRecords;
  readonly formulaGovernance: FormulaGovernanceInput;
}

export type BuildSpecResult =
  | { readonly ok: true; readonly buildSpec: BuildSpecV2 }
  | { readonly ok: false; readonly errors: readonly BuildSpecError[] };

export async function buildSpecEngine(
  config: BuildSpecEngineConfig,
): Promise<BuildSpecResult> {
  const architectureErrors = await authenticateArchitecture(
    config.architecture,
    config.architectureGovernance,
  );
  const ruleErrors = await authenticateFormulaRules(
    config.formulaGovernance,
    config.architectureGovernance,
  );
  const mapped = await generateFormulaDefinitions({
    architecture: config.architecture,
    governance: config.formulaGovernance,
  });
  const namedRanges = generateNamedRanges({
    architecture: config.architecture,
  });
  const cellMappings = await generateCellMappings({
    architecture: config.architecture,
  });
  const executionOrder = computeExecutionOrder({ formulas: mapped.formulas });
  const buildSpecId = await deterministicUuid("BuildSpecV2", {
    ...deterministicBuildSpecIdentityPayload({
      schemaVersion: "2.0.0",
      architectureId: config.architecture.architectureId,
      architectureContentSha256: config.architecture.architectureContentSha256,
      caseId: config.architecture.caseId,
      ruleSetVersion: config.architecture.ruleSetVersion,
      generatedAt: config.architecture.builtAt,
      architectureLineage: config.architecture.lineage,
      formulas: mapped.formulas,
      namedRanges,
      cellMappings,
      executionOrder,
    }),
  });
  const initialValidation: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    validatedAt: config.architecture.builtAt,
  };
  const draft: BuildSpecV2 = {
    schemaVersion: "2.0.0",
    buildSpecId,
    architectureId: config.architecture.architectureId,
    architectureContentSha256: config.architecture.architectureContentSha256,
    caseId: config.architecture.caseId,
    ruleSetVersion: config.architecture.ruleSetVersion,
    generatedAt: config.architecture.builtAt,
    architectureLineage: config.architecture.lineage,
    formulas: mapped.formulas,
    namedRanges,
    cellMappings,
    executionOrder,
    validation: initialValidation,
    buildSpecContentSha256: "0".repeat(64) as Sha256,
  };
  const validation = validateBuildSpec({
    buildSpec: draft,
    validatedAt: config.architecture.builtAt,
  });
  const errors = sortErrors([
    ...architectureErrors,
    ...ruleErrors,
    ...mapped.errors,
    ...validation.errors,
  ]);
  if (errors.length > 0) return { ok: false, errors };
  const validated = { ...draft, validation };
  const buildSpec: BuildSpecV2 = {
    ...validated,
    buildSpecContentSha256: await computeContentHash(validated),
  };
  const contract = validateContract("buildSpec", buildSpec);
  if (!contract.valid)
    return {
      ok: false,
      errors: contract.issues.map((issue) => ({
        code: "SCHEMA_VALIDATION_FAILED",
        message: issue.message,
        field: null,
        formulaId: null,
        context: { code: issue.code, instancePath: issue.instancePath },
      })),
    };
  return { ok: true, buildSpec };
}

async function authenticateFormulaRules(
  governance: FormulaGovernanceInput,
  records: ArchitectureGovernanceRecords,
): Promise<readonly ValidationError[]> {
  const errors: ValidationError[] = [];
  const ids = new Set<string>();
  for (const rule of [...governance.approvedPlanRules].sort((left, right) =>
    compareCodePoint(left.ruleId, right.ruleId),
  )) {
    if (ids.has(rule.ruleId))
      errors.push(
        makeError(
          "FORMULA_PROVENANCE_INVALID",
          "Approved plan-rule identity is duplicated.",
          { ruleId: rule.ruleId },
        ),
      );
    ids.add(rule.ruleId);
    const recordValidation = await validateRuleRecord(rule);
    const validation = recordValidation.ok
      ? await validateRuleGovernance(
          rule,
          records.evidenceCatalog,
          records.authorityOverrides,
        )
      : recordValidation;
    if (!validation.ok)
      errors.push(
        makeError(
          "FORMULA_PROVENANCE_INVALID",
          "Supplied approved plan rule failed governance/hash authentication.",
          { ruleId: rule.ruleId, reason: validation.error },
        ),
      );
  }
  return sortErrors(errors);
}

async function authenticateArchitecture(
  architecture: V1Architecture,
  records: ArchitectureGovernanceRecords,
): Promise<readonly ValidationError[]> {
  const errors: ValidationError[] = [];
  const contract = validateContract(
    "v1Architecture",
    architectureToJsonValue(architecture),
  );
  for (const issue of contract.issues)
    errors.push(
      makeError("ARCHITECTURE_INVALID", issue.message, {
        code: issue.code,
        path: issue.instancePath,
      }),
    );
  const content: V1ArchitectureContent = {
    caseId: architecture.caseId,
    schemaVersion: architecture.schemaVersion,
    ruleSetVersion: architecture.ruleSetVersion,
    lineage: architecture.lineage,
    sourceTabs: architecture.sourceTabs,
    runs: architecture.runs,
    cells: architecture.cells,
    formulaDependencies: architecture.formulaDependencies,
    namedRanges: architecture.namedRanges,
  };
  const computed = await computeArchitectureContentSha256(content);
  if (computed !== architecture.architectureContentSha256)
    errors.push(
      makeError(
        "ARCHITECTURE_HASH_MISMATCH",
        "Architecture content hash does not authenticate its semantic payload.",
        { expected: architecture.architectureContentSha256, actual: computed },
      ),
    );
  const policyKinds = architecture.lineage.policies.map(
    (policy) => policy.policyKind,
  );
  if (
    new Set(policyKinds).size !== 4 ||
    ![
      "scenario-selection",
      "tab-selection",
      "iob-classification",
      "field-name-glossary",
    ].every((kind) => policyKinds.includes(kind as never))
  )
    errors.push(
      makeError(
        "ARCHITECTURE_INVALID",
        "Architecture lineage must contain one approved identity for every governed architecture policy.",
        { policyKinds: policyKinds.sort(compareCodePoint) },
      ),
    );
  const scenarioPolicy = architecture.lineage.policies.find(
    (policy) => policy.policyKind === "scenario-selection",
  );
  const iobPolicy = architecture.lineage.policies.find(
    (policy) => policy.policyKind === "iob-classification",
  );
  if (scenarioPolicy?.policyVersion !== architecture.ruleSetVersion)
    errors.push(
      makeError(
        "ARCHITECTURE_RULE_SET_MISMATCH",
        "Architecture ruleSetVersion does not match governed scenario-policy lineage.",
        {
          architectureRuleSetVersion: architecture.ruleSetVersion,
          scenarioPolicyVersion: scenarioPolicy?.policyVersion ?? null,
        },
      ),
    );
  const runIds = new Set(architecture.runs.map((run) => run.runId));
  const tabNames = new Set(architecture.sourceTabs.map((tab) => tab.tabName));
  for (const [key, cell] of architecture.cells) {
    if (key !== cell.key || !tabNames.has(cell.sourceTab))
      errors.push(
        makeError(
          "ARCHITECTURE_INVALID",
          "Architecture cell identity or source tab is invalid.",
          { key, sourceTab: cell.sourceTab },
        ),
      );
    if (cell.hasFormula !== Boolean(cell.formulaText?.trim()))
      errors.push(
        makeError(
          "ARCHITECTURE_INVALID",
          "Architecture formula observation flags and text disagree.",
          { key },
        ),
      );
    for (const [runId, classification] of cell.perRunClassification)
      if (
        !runIds.has(runId) ||
        classification.runId !== runId ||
        classification.ruleVersion !== iobPolicy?.policyVersion
      )
        errors.push(
          makeError(
            classification.ruleVersion !== iobPolicy?.policyVersion
              ? "ARCHITECTURE_RULE_SET_MISMATCH"
              : "ARCHITECTURE_INVALID",
            "Cell classification run or governed policy version is mismatched.",
            {
              key,
              runId,
              classificationRuleVersion: classification.ruleVersion,
              iobPolicyVersion: iobPolicy?.policyVersion ?? null,
            },
          ),
        );
  }
  for (const dependency of architecture.formulaDependencies) {
    if (
      !runIds.has(dependency.runId) ||
      !architecture.cells.has(dependency.dependentKey) ||
      !architecture.cells.has(dependency.dependencyKey) ||
      dependency.referenceType === "external"
    )
      errors.push(
        makeError(
          "UNSATISFIED_DEPENDENCY",
          "Architecture formula dependency is unresolved or external.",
          { ...dependency },
        ),
      );
  }
  if (architecture.runs.length === 0 || architecture.cells.size === 0)
    errors.push(
      makeError(
        "ARCHITECTURE_INVALID",
        "Architecture must contain governed runs and observed cells.",
        {},
      ),
    );
  const replay = await reauthenticateArchitecture(architecture, records);
  if (!replay.ok)
    errors.push(
      makeError("ARCHITECTURE_INVALID", replay.error, {
        architectureId: architecture.architectureId,
      }),
    );
  return sortErrors(errors);
}

function makeError(
  code: ValidationError["code"],
  message: string,
  context: Readonly<Record<string, unknown>>,
): ValidationError {
  return { code, message, field: null, formulaId: null, context };
}
function sortErrors(
  errors: readonly ValidationError[],
): readonly ValidationError[] {
  return [...errors].sort((a, b) =>
    compareCodePoint(
      `${a.code}\u0000${a.formulaId ?? ""}\u0000${JSON.stringify(a.context)}`,
      `${b.code}\u0000${b.formulaId ?? ""}\u0000${JSON.stringify(b.context)}`,
    ),
  );
}

export type { BuildSpecV2 as BuildSpec, BuildSpecError };

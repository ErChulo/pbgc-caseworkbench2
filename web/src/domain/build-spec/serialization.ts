import { validateContract } from "../../contracts/schema-validator";
import { hashTyped } from "../manifests/canonical-json";
import type { Result, Sha256 } from "../shared/types";
import type {
  BuildSpecExport,
  BuildSpecImport,
  BuildSpecImportError,
  BuildSpecV2,
  ExportMetadata,
  FormulaProvenance,
  ImportMetadata,
} from "./models";
import { compareCodePoint } from "./identity";
import { validateBuildSpec } from "./validator";

export async function computeContentHash(
  buildSpec: BuildSpecV2,
): Promise<Sha256> {
  return (await hashTyped(deterministicBuildSpecPayload(buildSpec), {
    typeName: "BuildSpecDeterministicPayload",
  })) as Sha256;
}

export async function exportBuildSpec(config: {
  readonly buildSpec: BuildSpecV2;
  readonly operationalMetadata: ExportMetadata;
}): Promise<Result<BuildSpecExport, BuildSpecImportError>> {
  const contract = validateContract("buildSpec", config.buildSpec);
  if (!contract.valid)
    return schemaFailure(contract.issues.map((issue) => issue.code));
  const semanticIssues = semanticValidationIssues(config.buildSpec);
  const contentSha256 = await computeContentHash(config.buildSpec);
  if (semanticIssues.length > 0) return schemaFailure(semanticIssues);
  if (contentSha256 !== config.buildSpec.buildSpecContentSha256)
    return hashFailure(config.buildSpec.buildSpecContentSha256, contentSha256);
  return {
    ok: true,
    value: {
      buildSpec: config.buildSpec,
      exportMetadata: config.operationalMetadata,
      contentSha256,
    },
  };
}

export async function importBuildSpec(
  exported: unknown,
  operationalMetadata: Omit<ImportMetadata, "sourceHash" | "verified">,
): Promise<Result<BuildSpecImport, BuildSpecImportError>> {
  if (
    !isRecord(exported) ||
    !("buildSpec" in exported) ||
    typeof exported.contentSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(exported.contentSha256)
  )
    return schemaFailure([]);
  const contract = validateContract("buildSpec", exported.buildSpec);
  if (
    !contract.valid ||
    !isRecord(exported.buildSpec) ||
    exported.buildSpec.schemaVersion !== "2.0.0"
  )
    return schemaFailure(contract.issues.map((issue) => issue.code));
  const buildSpec = exported.buildSpec as unknown as BuildSpecV2;
  const semanticIssues = semanticValidationIssues(buildSpec);
  const sourceHash = exported.contentSha256 as Sha256;
  const computedHash = await computeContentHash(buildSpec);
  if (semanticIssues.length > 0) return schemaFailure(semanticIssues);
  if (computedHash !== sourceHash) return hashFailure(sourceHash, computedHash);
  if (computedHash !== buildSpec.buildSpecContentSha256)
    return hashFailure(buildSpec.buildSpecContentSha256, computedHash);
  return {
    ok: true,
    value: {
      buildSpec,
      importMetadata: { ...operationalMetadata, sourceHash, verified: true },
      contentSha256: computedHash,
    },
  };
}

function deterministicBuildSpecPayload(
  buildSpec: BuildSpecV2,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: buildSpec.schemaVersion,
    buildSpecId: buildSpec.buildSpecId,
    architectureId: buildSpec.architectureId,
    architectureContentSha256: buildSpec.architectureContentSha256,
    caseId: buildSpec.caseId,
    ruleSetVersion: buildSpec.ruleSetVersion,
    generatedAt: buildSpec.generatedAt,
    architectureLineage: normalizeLineage(buildSpec.architectureLineage),
    formulas: [...buildSpec.formulas]
      .sort((a, b) => compareCodePoint(a.formulaId, b.formulaId))
      .map((formula) => ({
        ...formula,
        dependencies: [...formula.dependencies].sort(compareCodePoint),
        provenance: normalizeProvenance(formula.provenance),
      })),
    namedRanges: [...buildSpec.namedRanges].sort((a, b) =>
      compareCodePoint(
        `${a.scope}\u0000${a.tabName}\u0000${a.rangeName}`,
        `${b.scope}\u0000${b.tabName}\u0000${b.rangeName}`,
      ),
    ),
    cellMappings: [...buildSpec.cellMappings].sort((a, b) =>
      compareCodePoint(a.mappingId, b.mappingId),
    ),
    executionOrder: {
      ...buildSpec.executionOrder,
      cycleNodes: [...buildSpec.executionOrder.cycleNodes].sort(
        compareCodePoint,
      ),
    },
    validation: {
      isValid: buildSpec.validation.isValid,
      errors: [...buildSpec.validation.errors].sort((a, b) =>
        compareCodePoint(
          `${a.code}\u0000${a.formulaId ?? ""}`,
          `${b.code}\u0000${b.formulaId ?? ""}`,
        ),
      ),
      warnings: [...buildSpec.validation.warnings].sort((a, b) =>
        compareCodePoint(a.code, b.code),
      ),
    },
  };
}

export function deterministicBuildSpecIdentityPayload(
  buildSpec: Omit<
    BuildSpecV2,
    "buildSpecId" | "validation" | "buildSpecContentSha256"
  >,
): Readonly<Record<string, unknown>> {
  return {
    architectureId: buildSpec.architectureId,
    architectureContentSha256: buildSpec.architectureContentSha256,
    caseId: buildSpec.caseId,
    ruleSetVersion: buildSpec.ruleSetVersion,
    architectureLineage: normalizeLineage(buildSpec.architectureLineage),
    formulas: [...buildSpec.formulas]
      .sort((a, b) => compareCodePoint(a.formulaId, b.formulaId))
      .map((formula) => ({
        ...formula,
        dependencies: [...formula.dependencies].sort(compareCodePoint),
        provenance: normalizeProvenance(formula.provenance),
      })),
    namedRanges: [...buildSpec.namedRanges].sort((a, b) =>
      compareCodePoint(
        `${a.scope}\u0000${a.tabName}\u0000${a.rangeName}`,
        `${b.scope}\u0000${b.tabName}\u0000${b.rangeName}`,
      ),
    ),
    cellMappings: [...buildSpec.cellMappings].sort((a, b) =>
      compareCodePoint(a.mappingId, b.mappingId),
    ),
    executionOrder: {
      ...buildSpec.executionOrder,
      cycleNodes: [...buildSpec.executionOrder.cycleNodes].sort(
        compareCodePoint,
      ),
    },
  };
}

function normalizeProvenance(provenance: FormulaProvenance): FormulaProvenance {
  return {
    ...provenance,
    sourcePlanRules: [...provenance.sourcePlanRules]
      .map((rule) => ({
        ...rule,
        applicabilityConditions: [...rule.applicabilityConditions]
          .map((condition) => ({
            ...condition,
            evidence: [...condition.evidence].sort((a, b) =>
              compareCodePoint(JSON.stringify(a), JSON.stringify(b)),
            ),
          }))
          .sort((a, b) =>
            compareCodePoint(
              `${a.dimension}\u0000${a.value}`,
              `${b.dimension}\u0000${b.value}`,
            ),
          ),
        supportingCitations: [...rule.supportingCitations].sort((a, b) =>
          compareCodePoint(JSON.stringify(a), JSON.stringify(b)),
        ),
        linkedUnresolvedItemIds: [...rule.linkedUnresolvedItemIds].sort(
          compareCodePoint,
        ),
        unresolvedItemIds: [...rule.unresolvedItemIds].sort(compareCodePoint),
      }))
      .sort((a, b) => compareCodePoint(a.ruleId, b.ruleId)),
    formulaApproval: {
      ...provenance.formulaApproval,
      sourcePlanRules: [...provenance.formulaApproval.sourcePlanRules].sort(
        (a, b) => compareCodePoint(a.ruleId, b.ruleId),
      ),
      affectedTestIds: [...provenance.formulaApproval.affectedTestIds].sort(
        compareCodePoint,
      ),
      validationOracleIds: [
        ...provenance.formulaApproval.validationOracleIds,
      ].sort(compareCodePoint),
    },
    affectedTestIds: [...provenance.affectedTestIds].sort(compareCodePoint),
    validationOracleIds: [...provenance.validationOracleIds].sort(
      compareCodePoint,
    ),
  };
}

function normalizeLineage(
  lineage: BuildSpecV2["architectureLineage"],
): BuildSpecV2["architectureLineage"] {
  return {
    ...lineage,
    policies: [...lineage.policies].sort((a, b) =>
      compareCodePoint(a.policyKind, b.policyKind),
    ),
    population: [...lineage.population].sort((a, b) =>
      compareCodePoint(a.candidateKey, b.candidateKey),
    ),
    caseControls: [...lineage.caseControls].sort((a, b) =>
      compareCodePoint(a.controlId, b.controlId),
    ),
    authorityOverrides: [...lineage.authorityOverrides].sort((a, b) =>
      compareCodePoint(a.overrideId, b.overrideId),
    ),
  };
}

function semanticValidationIssues(buildSpec: BuildSpecV2): readonly string[] {
  const recomputed = validateBuildSpec({
    buildSpec,
    validatedAt: buildSpec.validation.validatedAt,
  });
  const embeddedProjection = {
    isValid: buildSpec.validation.isValid,
    errors: buildSpec.validation.errors,
    warnings: buildSpec.validation.warnings,
  };
  const recomputedProjection = {
    isValid: recomputed.isValid,
    errors: recomputed.errors,
    warnings: recomputed.warnings,
  };
  return recomputed.isValid &&
    JSON.stringify(embeddedProjection) === JSON.stringify(recomputedProjection)
    ? []
    : [
        ...new Set([
          "BUILD_SPEC_SEMANTIC_VALIDATION_FAILED",
          ...recomputed.errors.map((error) => error.code),
        ]),
      ].sort(compareCodePoint);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function schemaFailure(
  issues: readonly string[],
): Result<never, BuildSpecImportError> {
  return { ok: false, error: { code: "BUILD_SPEC_SCHEMA_INVALID", issues } };
}
function hashFailure(
  expected: Sha256,
  actual: Sha256,
): Result<never, BuildSpecImportError> {
  return {
    ok: false,
    error: { code: "BUILD_SPEC_HASH_MISMATCH", expected, actual },
  };
}

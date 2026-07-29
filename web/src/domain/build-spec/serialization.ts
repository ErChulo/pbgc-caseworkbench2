import { hashTyped } from "../manifests/canonical-json";
import { validateContract } from "../../contracts/schema-validator";
import type { Result, Sha256, UtcTimestamp } from "../shared/types";
import type {
  BuildSpec,
  BuildSpecExport,
  BuildSpecImport,
  BuildSpecImportError,
  BuildSpecV2,
  ExportMetadata,
  FormulaProvenance,
  ImportMetadata,
} from "./models";

export interface SerializationConfig {
  readonly buildSpec: BuildSpec | BuildSpecV2;
}

export async function computeContentHash(
  buildSpec: BuildSpec | BuildSpecV2,
): Promise<Sha256> {
  return (await hashTyped(deterministicBuildSpecPayload(buildSpec), {
    typeName: "BuildSpecDeterministicPayload",
  })) as Sha256;
}

export async function exportBuildSpec(
  config: SerializationConfig,
): Promise<BuildSpecExport> {
  const { buildSpec } = config;
  const contentSha256 = await computeContentHash(buildSpec);

  const exportMetadata: ExportMetadata = {
    exportedAt: new Date().toISOString() as UtcTimestamp,
    exportedBy: "pb-gc-workbench",
    schemaVersion: buildSpec.schemaVersion,
    toolVersion: "1.0.0",
  };

  return {
    buildSpec,
    exportMetadata,
    contentSha256,
  };
}

export async function importBuildSpec(
  exported: unknown,
): Promise<Result<BuildSpecImport, BuildSpecImportError>> {
  if (
    exported === null ||
    typeof exported !== "object" ||
    !("buildSpec" in exported) ||
    !("contentSha256" in exported) ||
    typeof exported.contentSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(exported.contentSha256)
  )
    return {
      ok: false,
      error: { code: "BUILD_SPEC_SCHEMA_INVALID", issues: [] },
    };
  const contract = validateContract("buildSpec", exported.buildSpec);
  if (!contract.valid)
    return {
      ok: false,
      error: {
        code: "BUILD_SPEC_SCHEMA_INVALID",
        issues: contract.issues.map((issue) => issue.code),
      },
    };
  const buildSpec = exported.buildSpec as BuildSpec | BuildSpecV2;
  const sourceHash = exported.contentSha256 as Sha256;
  const computedHash = await computeContentHash(buildSpec);
  if (computedHash !== sourceHash)
    return {
      ok: false,
      error: {
        code: "BUILD_SPEC_HASH_MISMATCH",
        expected: sourceHash,
        actual: computedHash,
      },
    };
  if (computedHash !== buildSpec.buildSpecContentSha256)
    return {
      ok: false,
      error: {
        code: "BUILD_SPEC_HASH_MISMATCH",
        expected: buildSpec.buildSpecContentSha256,
        actual: computedHash,
      },
    };

  const importMetadata: ImportMetadata = {
    importedAt: new Date().toISOString() as UtcTimestamp,
    importedBy: "pb-gc-workbench",
    sourceHash,
    verified: true,
  };

  return {
    ok: true,
    value: { buildSpec, importMetadata, contentSha256: computedHash },
  };
}

function normalizeProvenance(provenance: FormulaProvenance): FormulaProvenance {
  return {
    ...provenance,
    sourcePlanRules: [...provenance.sourcePlanRules]
      .map((rule) => ({
        ...rule,
        applicabilityConditions: [...rule.applicabilityConditions].sort(
          (left, right) => {
            const leftKey = `${left.dimension}\u0000${left.value}`;
            const rightKey = `${right.dimension}\u0000${right.value}`;
            return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
          },
        ),
        unresolvedItemIds: [...rule.unresolvedItemIds].sort(),
      }))
      .sort((left, right) =>
        left.ruleContentSha256 < right.ruleContentSha256
          ? -1
          : left.ruleContentSha256 > right.ruleContentSha256
            ? 1
            : 0,
      ),
    affectedTestIds: [...provenance.affectedTestIds].sort(),
    validationOracleIds: [...provenance.validationOracleIds].sort(),
  };
}

function deterministicBuildSpecPayload(
  buildSpec: BuildSpec | BuildSpecV2,
): Readonly<Record<string, unknown>> {
  const sorted: Record<string, unknown> = {
    schemaVersion: buildSpec.schemaVersion,
    buildSpecId: buildSpec.buildSpecId,
    architectureId: buildSpec.architectureId,
    caseId: buildSpec.caseId,
    ruleSetVersion: buildSpec.ruleSetVersion,
    generatedAt: buildSpec.generatedAt,
    formulas: [...buildSpec.formulas]
      .sort((a, b) =>
        a.formulaId < b.formulaId ? -1 : a.formulaId > b.formulaId ? 1 : 0,
      )
      .map((f) => ({
        formulaId: f.formulaId,
        scenarioId: f.scenarioId,
        tabName: f.tabName,
        genericField: f.genericField,
        formulaText: f.formulaText,
        cellAddress: f.cellAddress,
        dependencies: [...f.dependencies].sort(),
        iobClassification: f.iobClassification,
        justification: f.justification,
        ...("formulaKind" in f ? { formulaKind: f.formulaKind } : {}),
        ...("provenance" in f
          ? {
              provenance: normalizeProvenance(f.provenance),
            }
          : {}),
      })),
    namedRanges: [...buildSpec.namedRanges]
      .sort((a, b) =>
        a.rangeName < b.rangeName ? -1 : a.rangeName > b.rangeName ? 1 : 0,
      )
      .map((r) => ({
        rangeName: r.rangeName,
        cellAddress: r.cellAddress,
        tabName: r.tabName,
        scope: r.scope,
        genericField: r.genericField,
        scenarioId: r.scenarioId,
        provenance: r.provenance,
      })),
    cellMappings: [...buildSpec.cellMappings]
      .sort((a, b) =>
        a.mappingId < b.mappingId ? -1 : a.mappingId > b.mappingId ? 1 : 0,
      )
      .map((m) => ({
        mappingId: m.mappingId,
        field: m.field,
        tabName: m.tabName,
        cellAddress: m.cellAddress,
        iobClassification: m.iobClassification,
        dataSource: m.dataSource,
        formulaId: m.formulaId,
        scenarioId: m.scenarioId,
      })),
    executionOrder: {
      order: [...buildSpec.executionOrder.order],
      levelCount: buildSpec.executionOrder.levelCount,
      maxDepth: buildSpec.executionOrder.maxDepth,
      hasCycles: buildSpec.executionOrder.hasCycles,
      cycleNodes: [...buildSpec.executionOrder.cycleNodes].sort(),
    },
    validation: {
      isValid: buildSpec.validation.isValid,
      errors: [...buildSpec.validation.errors].sort((left, right) =>
        left.code < right.code ? -1 : left.code > right.code ? 1 : 0,
      ),
      warnings: [...buildSpec.validation.warnings].sort((left, right) =>
        left.code < right.code ? -1 : left.code > right.code ? 1 : 0,
      ),
    },
  };

  return sorted;
}

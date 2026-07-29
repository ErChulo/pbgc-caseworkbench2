import type { BuildSpecV2, FormulaDefinitionV2 } from "../build-spec/models";
import { computeContentHash } from "../build-spec/serialization";
import { hashTyped } from "../manifests/canonical-json";
import { validateContract } from "../../contracts/schema-validator";
import type { Sha256 } from "../shared/types";
import { analyzeDependencies } from "./dependency-analysis";
import { materializeDiagnostics } from "./diagnostics";
import { emitCanonicalFormula } from "./emitter";
import type {
  BlockedFormula,
  CompilationResult,
  CompileFormulaRequest,
  CompiledFormula,
  CompiledFormulaPayload,
  DiagnosticDraft,
  FormulaTarget,
} from "./models";
import { parseFormula } from "./parser";
import { excelScalarV1Policy } from "./policy";
import { resolveFormulaReferences } from "./resolver";
import { createCompiledArtifact } from "./serialization";
import { normalizeCellAddress } from "./reference-codec";

const compilerId = "pbgc-caseworkbench-formula-compiler" as const;
const canonicalizationProfile = "pbgc-caseworkbench-canonical-json-v1" as const;

function target(formula: FormulaDefinitionV2): FormulaTarget {
  return {
    tabName: formula.tabName,
    cellAddress: formula.cellAddress,
    genericField: formula.genericField,
    iobClassification: formula.iobClassification === "B" ? "B" : "O",
  };
}

function diagnostic(
  formula: FormulaDefinitionV2,
  code: string,
  category: DiagnosticDraft["category"],
  message: string,
  context: DiagnosticDraft["context"] = {},
): DiagnosticDraft {
  return {
    code,
    category,
    severity: "error",
    blocksDownstream: true,
    formulaId: formula.formulaId,
    scenarioId: formula.scenarioId,
    sourceSpan: null,
    message,
    context,
  };
}

function validateProvenance(
  formula: FormulaDefinitionV2,
): readonly DiagnosticDraft[] {
  const issues: DiagnosticDraft[] = [];
  const provenance = formula.provenance;
  const governing = provenance.sourcePlanRules.filter(
    (rule) => rule.relationship === "governing",
  );
  if (governing.length !== 1)
    issues.push(
      diagnostic(
        formula,
        governing.length === 0
          ? "FORMULA_GOVERNING_RULE_MISSING"
          : "FORMULA_GOVERNING_RULE_AMBIGUOUS",
        "provenance",
        "Formula provenance must identify exactly one governing plan rule.",
      ),
    );
  if (governing.some((rule) => rule.reviewStatus !== "human-approved"))
    issues.push(
      diagnostic(
        formula,
        "FORMULA_REVIEW_NOT_APPROVED",
        "provenance",
        "The governing formula rule is not human approved.",
      ),
    );
  if (
    provenance.sourcePlanRules.some(
      (rule) => rule.linkedUnresolvedItemIds.length > 0,
    )
  )
    issues.push(
      diagnostic(
        formula,
        "FORMULA_UNRESOLVED_ITEM_PRESENT",
        "provenance",
        "Formula provenance contains an unresolved material issue.",
      ),
    );
  if (provenance.formulaApproval.resultingStatus !== "approved")
    issues.push(
      diagnostic(
        formula,
        "FORMULA_APPROVAL_MISSING",
        "provenance",
        "Formula approval record is required.",
      ),
    );
  if (provenance.formulaApproval.affectedTestIds.length === 0)
    issues.push(
      diagnostic(
        formula,
        "FORMULA_AFFECTED_TEST_ANALYSIS_MISSING",
        "provenance",
        "Affected-test analysis is required.",
      ),
    );
  if (!provenance.formulaApproval.regenerationImpact.trim())
    issues.push(
      diagnostic(
        formula,
        "FORMULA_REGENERATION_IMPACT_MISSING",
        "provenance",
        "Regeneration impact is required.",
      ),
    );
  if (provenance.formulaApproval.validationOracleIds.length === 0)
    issues.push(
      diagnostic(
        formula,
        "FORMULA_ORACLE_MISSING",
        "provenance",
        "At least one independent deterministic validation oracle is required.",
      ),
    );
  if (formula.iobClassification !== "O" && formula.iobClassification !== "B")
    issues.push(
      diagnostic(
        formula,
        "FORMULA_IOB_INVALID",
        "contract",
        "Compiled formulas must retain O or B I/O/B classification.",
      ),
    );
  return issues;
}

function validateCellMapping(
  formula: FormulaDefinitionV2,
  buildSpec: BuildSpecV2,
): readonly DiagnosticDraft[] {
  const mappings = buildSpec.cellMappings.filter(
    (mapping) => mapping.formulaId === formula.formulaId,
  );
  if (mappings.length !== 1)
    return [
      diagnostic(
        formula,
        mappings.length === 0
          ? "FORMULA_CELL_MAPPING_MISSING"
          : "FORMULA_CELL_MAPPING_AMBIGUOUS",
        "contract",
        "A formula must have exactly one CellMapping identified by formulaId.",
        { mappingCount: mappings.length },
      ),
    ];

  const mapping = mappings[0];
  if (!mapping) return [];
  const mismatches = [
    ["scenarioId", formula.scenarioId, mapping.scenarioId],
    ["tabName", formula.tabName, mapping.tabName],
    ["cellAddress", formula.cellAddress, mapping.cellAddress],
    ["field", formula.genericField, mapping.field],
    ["iobClassification", formula.iobClassification, mapping.iobClassification],
  ].filter(([, expected, actual]) => expected !== actual);
  return mismatches.length === 0
    ? []
    : [
        diagnostic(
          formula,
          "FORMULA_CELL_MAPPING_MISMATCH",
          "contract",
          "The formula and its CellMapping must agree on scenario, tab, cell, field, and I/O/B metadata.",
          {
            mismatchedFields: mismatches
              .map(([field]) => field)
              .sort()
              .join(","),
          },
        ),
      ];
}

function sameDependencies(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function validateUniqueIdentities(
  buildSpec: BuildSpecV2,
): readonly DiagnosticDraft[] {
  const issues: DiagnosticDraft[] = [];
  const check = (code: string, label: string, values: readonly string[]) => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) duplicates.add(value);
      seen.add(value);
    }
    if (duplicates.size > 0)
      issues.push({
        code,
        category: "contract",
        severity: "critical",
        blocksDownstream: true,
        formulaId: null,
        scenarioId: null,
        sourceSpan: null,
        message: `${label} identities must be unique.`,
        context: { duplicates: [...duplicates].sort().join(",") },
      });
  };
  check(
    "DUPLICATE_FORMULA_ID",
    "Formula",
    buildSpec.formulas.map((formula) => formula.formulaId),
  );
  check(
    "DUPLICATE_MAPPING_ID",
    "Cell mapping",
    buildSpec.cellMappings.map((mapping) => mapping.mappingId),
  );
  check(
    "DUPLICATE_MAPPING_CELL",
    "Scenario cell mapping",
    buildSpec.cellMappings.map(
      (mapping) =>
        `${mapping.scenarioId}\u0000${mapping.tabName.toUpperCase()}\u0000${mapping.cellAddress.toUpperCase()}`,
    ),
  );
  check(
    "DUPLICATE_MAPPING_FIELD",
    "Scenario field mapping",
    buildSpec.cellMappings.map(
      (mapping) =>
        `${mapping.scenarioId}\u0000${mapping.tabName.toUpperCase()}\u0000${mapping.field.toUpperCase()}`,
    ),
  );
  check(
    "DUPLICATE_NAMED_RANGE",
    "Named range",
    buildSpec.namedRanges.map(
      (range) =>
        `${range.scope}\u0000${range.scope === "sheet" ? range.tabName.toUpperCase() : ""}\u0000${range.rangeName.toUpperCase()}\u0000${range.scenarioId ?? ""}`,
    ),
  );
  const formulaIds = new Set(
    buildSpec.formulas.map((formula) => formula.formulaId),
  );
  const orphanedMappings = buildSpec.cellMappings.filter(
    (mapping) =>
      mapping.formulaId !== null && !formulaIds.has(mapping.formulaId),
  );
  if (orphanedMappings.length > 0)
    issues.push({
      code: "MAPPING_FORMULA_NOT_FOUND",
      category: "contract",
      severity: "critical",
      blocksDownstream: true,
      formulaId: null,
      scenarioId: null,
      sourceSpan: null,
      message: "Every CellMapping formulaId must identify a BuildSpec formula.",
      context: {
        mappingIds: orphanedMappings
          .map((mapping) => mapping.mappingId)
          .sort()
          .join(","),
        formulaIds: orphanedMappings
          .map((mapping) => mapping.formulaId)
          .sort()
          .join(","),
      },
    });
  return issues;
}

export async function compileBuildSpec(
  request: CompileFormulaRequest,
): Promise<CompilationResult> {
  const contractValidation = validateContract("buildSpec", request.buildSpec);
  const runtimeSchemaVersion =
    request.buildSpec !== null && typeof request.buildSpec === "object"
      ? (request.buildSpec as { readonly schemaVersion?: unknown })
          .schemaVersion
      : undefined;
  if (!contractValidation.valid || runtimeSchemaVersion !== "2.0.0") {
    const oracleMissing = contractValidation.issues.some((issue) =>
      issue.instancePath.includes("validationOracleIds"),
    );
    const diagnostics = await materializeDiagnostics([
      {
        code: oracleMissing
          ? "FORMULA_ORACLE_MISSING"
          : "BUILD_SPEC_SCHEMA_INVALID",
        category: oracleMissing ? "provenance" : "contract",
        severity: "critical",
        blocksDownstream: true,
        formulaId: null,
        scenarioId: null,
        sourceSpan: null,
        message: oracleMissing
          ? "At least one independent deterministic validation oracle is required."
          : "The compiler requires a schema-valid BuildSpec 2.0.0.",
        context: { issueCount: contractValidation.issues.length },
      },
    ]);
    return { status: "blocked", artifact: null, diagnostics };
  }
  const buildSpec = request.buildSpec as BuildSpecV2;
  if (!buildSpec.validation.isValid) {
    const diagnostics = await materializeDiagnostics([
      {
        code: "BUILD_SPEC_VALIDATION_FAILED",
        category: "contract",
        severity: "critical",
        blocksDownstream: true,
        formulaId: null,
        scenarioId: null,
        sourceSpan: null,
        message: "The BuildSpec validation result is not valid.",
        context: {},
      },
    ]);
    return { status: "blocked", artifact: null, diagnostics };
  }
  const duplicateIssues = validateUniqueIdentities(buildSpec);
  if (duplicateIssues.length > 0) {
    const formulasById = new Map(
      buildSpec.formulas.map((formula) => [formula.formulaId, formula]),
    );
    const mappingIssues = [...formulasById.values()].flatMap((formula) =>
      validateCellMapping(formula, buildSpec),
    );
    const diagnostics = await materializeDiagnostics([
      ...duplicateIssues,
      ...mappingIssues,
    ]);
    return { status: "blocked", artifact: null, diagnostics };
  }
  const policy = request.policy ?? excelScalarV1Policy;
  const policyContentSha256 = (await hashTyped(policy, {
    typeName: "CompilerPolicy",
  })) as Sha256;
  const approvedPolicyContentSha256 = (await hashTyped(excelScalarV1Policy, {
    typeName: "CompilerPolicy",
  })) as Sha256;
  if (policyContentSha256 !== approvedPolicyContentSha256) {
    const diagnostics = await materializeDiagnostics([
      {
        code: "COMPILER_POLICY_HASH_MISMATCH",
        category: "integrity",
        severity: "critical",
        blocksDownstream: true,
        formulaId: null,
        scenarioId: null,
        sourceSpan: null,
        message: "Compiler policy content does not match the approved policy.",
        context: {
          expected: approvedPolicyContentSha256,
          actual: policyContentSha256,
        },
      },
    ]);
    return { status: "blocked", artifact: null, diagnostics };
  }
  const sourceHash = await computeContentHash(buildSpec);
  const drafts: DiagnosticDraft[] = [];
  if (sourceHash !== buildSpec.buildSpecContentSha256)
    drafts.push({
      code: "BUILD_SPEC_HASH_MISMATCH",
      category: "integrity",
      severity: "critical",
      blocksDownstream: true,
      formulaId: null,
      scenarioId: null,
      sourceSpan: null,
      message:
        "BuildSpec content hash does not match its deterministic content.",
      context: {
        expected: buildSpec.buildSpecContentSha256,
        actual: sourceHash,
      },
    });

  const candidates = new Map<string, CompiledFormula>();
  const failedIds = new Set<string>();
  for (const formula of [...buildSpec.formulas].sort((a, b) =>
    a.formulaId < b.formulaId ? -1 : a.formulaId > b.formulaId ? 1 : 0,
  )) {
    const formulaIssues = [
      ...validateProvenance(formula),
      ...validateCellMapping(formula, buildSpec),
    ];
    if (normalizeCellAddress(formula.cellAddress) !== formula.cellAddress)
      formulaIssues.push(
        diagnostic(
          formula,
          "INVALID_TARGET_CELL",
          "contract",
          "Formula target must be a canonical in-grid A1 cell address.",
          { cellAddress: formula.cellAddress },
        ),
      );
    const parsed = parseFormula(formula.formulaText, policy);
    if (!parsed.ok)
      formulaIssues.push(
        ...parsed.issues.map((entry) => ({
          ...entry,
          formulaId: formula.formulaId,
          scenarioId: formula.scenarioId,
        })),
      );
    if (parsed.ok) {
      const resolved = resolveFormulaReferences(
        formula.formulaText,
        parsed.ast,
        formula,
        buildSpec,
        policy,
      );
      formulaIssues.push(...resolved.issues);
      if (!sameDependencies(formula.dependencies, resolved.dependencies))
        formulaIssues.push(
          diagnostic(
            formula,
            "DEPENDENCY_DECLARATION_MISMATCH",
            "dependency",
            "Declared dependencies do not match dependencies derived from resolved formula references.",
            {
              declared: [...formula.dependencies].sort().join(","),
              derived: resolved.dependencies.join(","),
            },
          ),
        );
      if (formulaIssues.length === 0)
        candidates.set(formula.formulaId, {
          formulaId: formula.formulaId,
          status: "compiled",
          scenarioId: formula.scenarioId,
          target: target(formula),
          sourceFormulaText: formula.formulaText,
          canonicalFormulaText: emitCanonicalFormula(
            parsed.ast,
            resolved.replacements,
          ),
          dependencies: resolved.dependencies,
          resolvedReferences: resolved.references,
          provenance: formula.provenance,
        });
    }
    if (formulaIssues.length > 0) {
      failedIds.add(formula.formulaId);
      drafts.push(...formulaIssues);
    }
  }

  if (
    drafts.some((entry) => entry.formulaId === null && entry.blocksDownstream)
  )
    buildSpec.formulas.forEach((formula) => failedIds.add(formula.formulaId));
  const analysis = analyzeDependencies(
    buildSpec.formulas.map((formula) => ({
      formulaId: formula.formulaId,
      dependencies:
        candidates.get(formula.formulaId)?.dependencies ?? formula.dependencies,
    })),
    failedIds,
  );
  drafts.push(
    ...analysis.issues.map((entry) => ({
      ...entry,
      scenarioId:
        buildSpec.formulas.find(
          (formula) => formula.formulaId === entry.formulaId,
        )?.scenarioId ?? null,
    })),
  );
  const diagnostics = await materializeDiagnostics(drafts);
  const blockedFormulas: BlockedFormula[] = buildSpec.formulas
    .filter(
      (formula) =>
        failedIds.has(formula.formulaId) ||
        analysis.cycleIds.has(formula.formulaId) ||
        analysis.dependencyBlocked.has(formula.formulaId),
    )
    .map((formula): BlockedFormula => {
      const isCycle = analysis.cycleIds.has(formula.formulaId);
      const causes = isCycle
        ? (analysis.cycleMembers.get(formula.formulaId) ?? [formula.formulaId])
        : (analysis.dependencyBlocked.get(formula.formulaId) ?? []);
      return {
        formulaId: formula.formulaId,
        status: isCycle
          ? "cycle-blocked"
          : failedIds.has(formula.formulaId)
            ? "failed"
            : "dependency-blocked",
        scenarioId: formula.scenarioId,
        target: target(formula),
        sourceFormulaText: formula.formulaText,
        causalFormulaIds: causes,
        diagnosticKeys: diagnostics
          .filter((entry) => entry.formulaId === formula.formulaId)
          .map((entry) => entry.diagnosticKey),
        provenance: formula.provenance,
      };
    })
    .sort((a, b) =>
      a.formulaId < b.formulaId ? -1 : a.formulaId > b.formulaId ? 1 : 0,
    );
  const blockedIds = new Set(
    blockedFormulas.map((formula) => formula.formulaId),
  );
  const compiledFormulas = analysis.executionOrder
    .map((id) => candidates.get(id))
    .filter(
      (formula): formula is CompiledFormula =>
        formula !== undefined && !blockedIds.has(formula.formulaId),
    );
  const status =
    compiledFormulas.length === buildSpec.formulas.length
      ? "complete"
      : compiledFormulas.length > 0
        ? "partial"
        : "blocked";
  const payload: CompiledFormulaPayload = {
    sourceBuildSpec: {
      schemaVersion: "2.0.0",
      buildSpecId: buildSpec.buildSpecId,
      buildSpecContentSha256: buildSpec.buildSpecContentSha256,
      architectureId: buildSpec.architectureId,
      caseId: buildSpec.caseId,
    },
    compiler: {
      compilerId,
      compilerVersion: request.compilerVersion,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyContentSha256,
      canonicalizationProfile,
    },
    status,
    compiledFormulas,
    blockedFormulas,
    executionOrder: compiledFormulas.map((formula) => formula.formulaId),
    diagnostics,
  };
  const artifact = await createCompiledArtifact(payload, {
    compilationRunId: request.uuid.generate(),
    generatedAt: request.clock.now(),
  });
  return { status, artifact, diagnostics };
}

export type {
  CompileFormulaRequest,
  CompilationResult,
  CompiledFormulaArtifact,
} from "./models";

import { normalizeCellAddress } from "../formula-compiler/reference-codec";
import { compileBuildSpec } from "../formula-compiler/compiler";
import { validateCompiledArtifact } from "../formula-compiler/serialization";
import type {
  CompilationResult,
  CompiledFormulaArtifact,
} from "../formula-compiler/models";
import { deterministicUuid } from "../build-spec/identity";
import { computeWorkbookContentHash } from "./workbook-hash";
import { validateCalculationSheetNames } from "./sheet-policy";
import { parseSha256, type Sha256 } from "../shared/types";
import type {
  WorkbookGenerationInput,
  V1Workbook,
  WorkbookSheet,
  SummarySheetData,
  TablesSheetData,
  UDTableSheetData,
  PlanRuleRow,
  WorkbookGenerationError,
} from "./models";
import {
  validateBuildSpec,
  validatePopulationProfile,
  validateDataSources,
  validateFormulaReferences,
  validateNoCycles,
  aggregateValidationResults,
} from "./validation";
import {
  generateFormulaCells,
  populateDataCells,
  mergeSheetCells,
} from "./formula-sheets";
import {
  createPopulationDataResolver,
  type PopulationDataResolver,
} from "./population-data-resolver";

/** Preliminary model builder. Production callers must use buildCompiledWorkbook. */
export async function buildWorkbook(
  input: WorkbookGenerationInput,
): Promise<
  | { ok: true; workbook: V1Workbook }
  | { ok: false; errors: readonly WorkbookGenerationError[] }
> {
  return buildWorkbookInternal(input);
}

/** Verify and independently reproduce compiler output before materializing it. */
export async function buildCompiledWorkbook(
  input: WorkbookGenerationInput,
  compilation: CompilationResult,
): Promise<
  | { ok: true; workbook: V1Workbook }
  | { ok: false; errors: readonly WorkbookGenerationError[] }
> {
  const blocked = (): {
    ok: false;
    errors: readonly WorkbookGenerationError[];
  } => ({
    ok: false,
    errors: [
      {
        code: "COMPILED_FORMULAS_INVALID",
        severity: "error",
        message: "Complete, verified compiled formulas are required.",
        affectedCells: [],
        affectedNames: [],
        detail:
          "The compiler output must match a fresh compilation of this BuildSpec under the supported compiler policy.",
        remediation:
          "Resolve compilation blockers and regenerate the BuildSpec and compiled formulas.",
      },
    ],
  });
  const artifact = compilation.artifact;
  if (
    input.buildSpec.formulas.length === 0 ||
    compilation.status !== "complete" ||
    artifact === null ||
    compilation.diagnostics.some((diagnostic) => diagnostic.blocksDownstream)
  )
    return blocked();
  const validation = await validateCompiledArtifact(artifact);
  if (
    !validation.valid ||
    artifact.deterministicPayload.status !== "complete" ||
    artifact.deterministicPayload.blockedFormulas.length !== 0
  )
    return blocked();
  const fresh = await compileBuildSpec({
    buildSpec: input.buildSpec,
    compilerVersion: "1.0.0",
    clock: { now: () => artifact.operationalMetadata.generatedAt },
    uuid: { generate: () => artifact.operationalMetadata.compilationRunId },
  });
  if (
    fresh.status !== "complete" ||
    fresh.artifact?.contentSha256 !== artifact.contentSha256 ||
    fresh.diagnostics.some((diagnostic) => diagnostic.blocksDownstream)
  )
    return blocked();
  const targets = new Set<string>();
  for (const formula of fresh.artifact.deterministicPayload.compiledFormulas) {
    const address = normalizeCellAddress(formula.target.cellAddress);
    if (address === null) return blocked();
    const key = `${formula.target.tabName.toUpperCase()}!${address.replaceAll("$", "")}`;
    if (targets.has(key)) {
      return {
        ok: false,
        errors: [
          {
            code: "FORMULA_TARGET_COLLISION",
            severity: "error",
            message: "More than one scenario writes to the same workbook cell.",
            affectedCells: [formula.target.cellAddress],
            affectedNames: [],
            detail:
              "Separate scenario outputs need distinct approved cell targets.",
            remediation:
              "Resolve the scenario target layout and regenerate the BuildSpec.",
          },
        ],
      };
    }
    targets.add(key);
  }
  if (
    input.buildSpec.cellMappings.some(
      (mapping) =>
        mapping.iobClassification === "I" || mapping.iobClassification === "B",
    )
  ) {
    return {
      ok: false,
      errors: [
        {
          code: "POPULATION_ROUTING_UNVERIFIED",
          severity: "error",
          message:
            "Approved participant-level population routing is not available.",
          affectedCells: [],
          affectedNames: [],
          detail:
            "The current column arrays do not bind input values to an approved participant and workbook row.",
          remediation:
            "Complete and review participant-level population routing before generating the workbook.",
        },
      ],
    };
  }
  return buildWorkbookInternal(input, fresh.artifact);
}

async function buildWorkbookInternal(
  input: WorkbookGenerationInput,
  compiled?: CompiledFormulaArtifact,
): Promise<
  | { ok: true; workbook: V1Workbook }
  | { ok: false; errors: readonly WorkbookGenerationError[] }
> {
  const validationBuildSpec = validateBuildSpec(input.buildSpec);
  const validationPopulation = validatePopulationProfile(
    input.populationProfile,
  );
  const validationDataSources = validateDataSources(input.buildSpec);
  const validationReferences = validateFormulaReferences(input.buildSpec);
  const validationCycles = validateNoCycles(input.buildSpec);

  const validation = aggregateValidationResults(
    validationBuildSpec,
    validationPopulation,
    validationDataSources,
    validationReferences,
    validationCycles,
  );

  if (validation.errors.length > 0) {
    return { ok: false, errors: validation.errors };
  }

  const profileHash =
    input.populationProfile.effectiveWorkbookProfileContentSha256;
  const matchesLineage = input.buildSpec.architectureLineage.population.some(
    (entry) =>
      entry.workbookProfileContentSha256 === profileHash &&
      entry.approvalDecisionId === input.populationProfile.effectiveDecisionId,
  );
  if (
    profileHash === null ||
    profileHash !== input.workbookProfileContentSha256 ||
    !matchesLineage
  ) {
    return {
      ok: false,
      errors: [
        {
          code: "POPULATION_LINEAGE_MISMATCH",
          severity: "error",
          message: "Approved population does not match the BuildSpec lineage.",
          affectedCells: [],
          affectedNames: [],
          detail:
            "The selected population hash and approval decision must match the BuildSpec population lineage.",
          remediation:
            "Select the approved population and regenerate the BuildSpec.",
        },
      ],
    };
  }

  const zeroHashParsed = parseSha256("0".repeat(64));
  if (!zeroHashParsed.ok) {
    return {
      ok: false,
      errors: [
        {
          code: "HASH_FAILED",
          message: "Failed to parse zero hash",
          affectedCells: [],
          affectedNames: [],
          severity: "error",
          detail: "Failed to parse deterministic zero hash placeholder.",
          remediation:
            "Verify shared hash parsing utilities and retry workbook generation.",
        },
      ],
    };
  }
  const zeroHash = zeroHashParsed.value;

  const summarySheet = generateSummarySheet(input, zeroHash);
  const tablesSheet = generateTablesSheet(input);
  const udTableSheet = generateUDTableSheet(input);

  const supportContent = {
    summarySheet,
    tablesSheet,
    udTableSheet,
  };

  const populationProfileContentSha256 =
    input.populationProfile.effectiveWorkbookProfileContentSha256 ?? zeroHash;

  const compiledById =
    compiled === undefined
      ? null
      : new Map(
          compiled.deterministicPayload.compiledFormulas.map((formula) => [
            formula.formulaId,
            formula,
          ]),
        );
  const formulas =
    compiledById === null
      ? input.buildSpec.formulas
      : input.buildSpec.formulas.map((formula) => {
          const canonical = compiledById.get(formula.formulaId);
          if (!canonical)
            throw new Error("Verified compiler output is missing a formula.");
          return {
            ...formula,
            formulaText: `=${canonical.canonicalFormulaText}`,
            dependencies: canonical.dependencies,
          };
        });
  const formulaResult = generateFormulaCells({
    formulas,
    executionOrder:
      compiled === undefined
        ? input.buildSpec.executionOrder
        : {
            ...input.buildSpec.executionOrder,
            order: compiled.deterministicPayload.executionOrder,
          },
  });

  let resolver: PopulationDataResolver | undefined;
  if (input.populationData) {
    resolver = createPopulationDataResolver(input.populationData);
  }
  const dataCells = populateDataCells(input.buildSpec.cellMappings, resolver);
  const allCells = mergeSheetCells(formulaResult.cellsByTab, dataCells);

  const sheets: WorkbookSheet[] = [...allCells.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([name, cells]) => ({
      name,
      hidden: false,
      cells,
    }));

  const sheetErrors = validateCalculationSheetNames(
    sheets.map((sheet) => sheet.name),
  );
  if (sheetErrors.length > 0) return { ok: false, errors: sheetErrors };

  const workbookId = await deterministicUuid("V1Workbook", {
    buildSpecId: input.buildSpec.buildSpecId,
    buildSpecContentSha256: input.buildSpec.buildSpecContentSha256,
    populationDecisionId: input.populationProfile.effectiveDecisionId,
    populationProfileContentSha256: populationProfileContentSha256,
    ...(compiled === undefined
      ? {}
      : { compiledFormulaContentSha256: compiled.contentSha256 }),
  });

  const workbook: V1Workbook = {
    workbookId,
    buildSpecId: input.buildSpec.buildSpecId,
    buildSpecContentSha256: input.buildSpec.buildSpecContentSha256,
    architectureId: input.buildSpec.architectureId,
    architectureContentSha256: input.buildSpec.architectureContentSha256,
    caseId: input.buildSpec.caseId,
    populationProfileDecisionId:
      input.populationProfile.effectiveDecisionId ?? null,
    populationProfileContentSha256: populationProfileContentSha256,
    generatedAt: input.buildSpec.generatedAt,
    sheets,
    namedRanges: input.buildSpec.namedRanges,
    cellMappings: input.buildSpec.cellMappings,
    formulaCells: formulaResult.formulaCells,
    support: supportContent,
    workbookContentSha256: zeroHash,
  };

  const hash = await computeWorkbookContentHash(workbook);
  const parsedHash = parseSha256(hash);
  if (!parsedHash.ok) {
    return {
      ok: false,
      errors: [
        {
          code: "HASH_FAILED",
          message: hash,
          affectedCells: [],
          affectedNames: [],
          severity: "error",
          detail: "Workbook content hash parsing failed.",
          remediation:
            "Verify workbook serialization output and shared hash parsing.",
        },
      ],
    };
  }

  return {
    ok: true,
    workbook: { ...workbook, workbookContentSha256: parsedHash.value },
  };
}

function generateSummarySheet(
  input: WorkbookGenerationInput,
  zeroHash: Sha256,
): SummarySheetData {
  return {
    caseId: input.buildSpec.caseId,
    architectureId: input.buildSpec.architectureId,
    architectureContentSha256: input.buildSpec.architectureContentSha256,
    buildSpecId: input.buildSpec.buildSpecId,
    buildSpecContentSha256: input.buildSpec.buildSpecContentSha256,
    populationProfileDecisionId:
      input.populationProfile.effectiveDecisionId ?? null,
    populationProfileContentSha256:
      input.populationProfile.effectiveWorkbookProfileContentSha256 ?? zeroHash,
    generatedAt: input.buildSpec.generatedAt,
    generatorVersion: input.generatorVersion,
    workbookContentSha256: zeroHash,
  };
}

function generateTablesSheet(input: WorkbookGenerationInput): TablesSheetData {
  const seenRuleIds = new Set<string>();
  const rules: PlanRuleRow[] = [];

  for (const formula of input.buildSpec.formulas) {
    for (const sourceRule of formula.provenance.sourcePlanRules) {
      if (seenRuleIds.has(sourceRule.ruleId)) continue;
      seenRuleIds.add(sourceRule.ruleId);

      const applicability = sourceRule.applicabilityConditions
        .map((c) => `${c.dimension}=${c.value}`)
        .join("; ");

      rules.push({
        ruleId: sourceRule.ruleId,
        statement: sourceRule.governingRestatement,
        effectiveDate: sourceRule.effectiveDate,
        endDate: sourceRule.endDate,
        applicability,
        primaryCitation: sourceRule.primaryCitation.citationLocator,
      });
    }
  }

  return { rules };
}

function generateUDTableSheet(
  input: WorkbookGenerationInput,
): UDTableSheetData {
  return {
    namedRanges: input.buildSpec.namedRanges.map((nr) => ({
      name: nr.rangeName,
      scope: nr.scope,
      target: nr.cellAddress,
      genericField: nr.genericField ?? null,
    })),
    cellMappings: input.buildSpec.cellMappings.map((cm) => ({
      mappingId: cm.mappingId,
      cellAddress: cm.cellAddress,
      iobValue: cm.iobClassification,
      dataSource: cm.dataSource
        ? `${cm.dataSource.sourceTab}!${cm.dataSource.sourceField}`
        : null,
      formulaId: cm.formulaId ?? null,
    })),
  };
}

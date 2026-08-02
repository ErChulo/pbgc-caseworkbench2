import { deterministicUuid } from "../build-spec/identity";
import { hashTyped } from "../manifests/canonical-json";
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

export async function buildWorkbook(
  input: WorkbookGenerationInput,
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

  const formulaResult = generateFormulaCells({
    formulas: input.buildSpec.formulas,
    executionOrder: input.buildSpec.executionOrder,
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

  const workbookId = await deterministicUuid("V1Workbook", {
    buildSpecId: input.buildSpec.buildSpecId,
    buildSpecContentSha256: input.buildSpec.buildSpecContentSha256,
    populationDecisionId: input.populationProfile.effectiveDecisionId,
    populationProfileContentSha256: populationProfileContentSha256,
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

async function computeWorkbookContentHash(
  workbook: V1Workbook,
): Promise<string> {
  const { workbookContentSha256: omitted, ...content } = workbook;
  void omitted;
  return hashTyped({ workbook: content }, { typeName: "V1WorkbookContent" });
}

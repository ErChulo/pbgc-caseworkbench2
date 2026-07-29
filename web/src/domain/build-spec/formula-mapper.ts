import type {
  CellDescriptor,
  RunDescriptor,
  V1Architecture,
} from "../architecture/models";
import type { PlanRuleRecord } from "../plan-rules/models";
import { replayFormulaApprovals } from "./formula-approval";
import type {
  FormulaDefinitionV2,
  FormulaGovernanceEntry,
  FormulaGovernanceInput,
  FormulaProvenance,
  ValidationError,
} from "./models";
import { compareCodePoint, formulaIdentity } from "./identity";

export interface FormulaMapperConfig {
  readonly architecture: V1Architecture;
  readonly governance: FormulaGovernanceInput;
}

export interface FormulaMapperResult {
  readonly formulas: readonly FormulaDefinitionV2[];
  readonly errors: readonly ValidationError[];
}

export function generateFormulaId(
  cell: CellDescriptor,
  run: RunDescriptor,
): string {
  return formulaIdentity(cell.key, run.runId);
}

export async function generateFormulaDefinitions(
  config: FormulaMapperConfig,
): Promise<FormulaMapperResult> {
  const { architecture, governance } = config;
  const errors: ValidationError[] = [];
  const formulas: FormulaDefinitionV2[] = [];
  const rules = new Map(
    governance.approvedPlanRules.map((rule) => [rule.ruleId, rule]),
  );
  const entries = new Map<string, FormulaGovernanceEntry>();

  for (const entry of governance.formulas) {
    const key = governanceKey(entry.cellKey, entry.scenarioId);
    if (entries.has(key))
      errors.push(
        error(
          "FORMULA_GOVERNANCE_INVALID",
          "Duplicate formula governance entry.",
          null,
          null,
          { key },
        ),
      );
    else entries.set(key, entry);
  }

  for (const run of [...architecture.runs].sort((a, b) =>
    compareCodePoint(a.runId, b.runId),
  )) {
    for (const cell of [...architecture.cells.values()].sort((a, b) =>
      compareCodePoint(a.key, b.key),
    )) {
      const classification = cell.perRunClassification.get(run.runId);
      if (!classification || !cell.hasFormula || !cell.formulaText?.trim())
        continue;
      const formulaId = generateFormulaId(cell, run);
      if (classification.iob !== "O" && classification.iob !== "B") {
        errors.push(
          error(
            "MAPPING_MISMATCH",
            "An observed formula cell must be classified O or B for compilation.",
            cell.genericField,
            formulaId,
            { iob: classification.iob },
          ),
        );
        continue;
      }
      const entry = entries.get(governanceKey(cell.key, run.runId));
      const provenance = entry
        ? await resolveProvenance(
            entry,
            run,
            rules,
            architecture,
            errors,
            formulaId,
            cell.genericField,
          )
        : null;
      if (!entry)
        errors.push(
          error(
            "FORMULA_GOVERNANCE_INVALID",
            "Observed formula cell lacks explicit formula governance.",
            cell.genericField,
            formulaId,
            { cellKey: cell.key, scenarioId: run.runId },
          ),
        );
      if (!provenance) continue;
      formulas.push({
        formulaId,
        scenarioId: run.runId,
        tabName: cell.sourceTab,
        genericField: cell.genericField,
        formulaText: cell.formulaText,
        cellAddress: cell.cellAddress,
        dependencies: extractDependencies(cell, run, architecture),
        iobClassification: classification.iob,
        justification: classification.justification,
        formulaKind: "scalar",
        provenance,
      });
    }
  }

  for (const [key] of entries) {
    const [cellKey, scenarioId] = key.split("\u0000");
    const cell = architecture.cells.get(cellKey ?? "");
    if (
      !cell?.hasFormula ||
      !cell.formulaText?.trim() ||
      !cell.perRunClassification.has(scenarioId ?? "")
    )
      errors.push(
        error(
          "FORMULA_GOVERNANCE_INVALID",
          "Formula governance does not identify an observed applicable formula cell.",
          cell?.genericField ?? null,
          null,
          { key },
        ),
      );
  }

  return {
    formulas: formulas.sort((a, b) =>
      compareCodePoint(a.formulaId, b.formulaId),
    ),
    errors: sortErrors(errors),
  };
}

export function extractDependencies(
  cell: CellDescriptor,
  run: RunDescriptor,
  architecture: V1Architecture,
): readonly string[] {
  return architecture.formulaDependencies
    .filter(
      (dependency) =>
        dependency.runId === run.runId && dependency.dependentKey === cell.key,
    )
    .map((dependency) => architecture.cells.get(dependency.dependencyKey))
    .filter((dependency): dependency is CellDescriptor =>
      Boolean(dependency?.hasFormula && dependency.formulaText?.trim()),
    )
    .map((dependency) => formulaIdentity(dependency.key, run.runId))
    .sort(compareCodePoint);
}

async function resolveProvenance(
  entry: FormulaGovernanceEntry,
  run: RunDescriptor,
  rules: ReadonlyMap<string, PlanRuleRecord>,
  architecture: V1Architecture,
  errors: ValidationError[],
  formulaId: string,
  field: string,
): Promise<FormulaProvenance | null> {
  const replay = await replayFormulaApprovals(entry.approvalDecisions);
  if (!replay.ok) {
    errors.push(
      error("FORMULA_PROVENANCE_INVALID", replay.error, field, formulaId, {
        scenarioId: run.runId,
      }),
    );
    return null;
  }
  const approval = replay.value;
  const resolved = approval.sourcePlanRules.map(({ ruleId, relationship }) => ({
    rule: rules.get(ruleId),
    relationship,
  }));
  const governing = resolved.filter(
    (item) => item.relationship === "governing",
  );
  const invalid =
    resolved.some(
      ({ rule }, index) =>
        rule?.reviewStatus !== "human-approved" ||
        rule.linkedUnresolvedItemIds.length > 0 ||
        rule.ruleContentSha256 !==
          approval.sourcePlanRules[index]?.ruleContentSha256,
    ) ||
    governing.length !== 1 ||
    approval.formulaText !==
      architecture.cells.get(entry.cellKey)?.formulaText ||
    approval.target.tabName !==
      architecture.cells.get(entry.cellKey)?.sourceTab ||
    approval.target.cellAddress !==
      architecture.cells.get(entry.cellKey)?.cellAddress ||
    approval.target.genericField !==
      architecture.cells.get(entry.cellKey)?.genericField ||
    approval.scenarioId !== run.runId ||
    approval.iobClassification !==
      architecture.cells.get(entry.cellKey)?.perRunClassification.get(run.runId)
        ?.iob ||
    new Set(approval.sourcePlanRules.map((source) => source.ruleId)).size !==
      approval.sourcePlanRules.length;
  const governingRule = governing[0]?.rule;
  const justified =
    governingRule &&
    run.justifications.some(
      (item) =>
        item.source === "plan-rule" &&
        item.referenceId === governingRule.ruleId &&
        item.referenceContentSha256 === governingRule.ruleContentSha256,
    );
  const overridesValid = resolved.every(
    ({ rule }) =>
      !rule?.authorityOverrideId ||
      architecture.lineage.authorityOverrides.some(
        (item) => item.overrideId === rule.authorityOverrideId,
      ),
  );
  const effective =
    governingRule !== undefined &&
    governingRule.effectiveDate <= run.effectiveDateRange.startDate &&
    (governingRule.endDate === null ||
      (run.effectiveDateRange.endDate !== null &&
        governingRule.endDate >= run.effectiveDateRange.endDate));
  if (invalid || !justified || !overridesValid || !effective) {
    errors.push(
      error(
        "FORMULA_PROVENANCE_INVALID",
        "Formula governance must resolve to exactly one architecture-justified, human-approved governing rule with complete review evidence.",
        field,
        formulaId,
        { scenarioId: run.runId },
      ),
    );
    return null;
  }
  return {
    sourcePlanRules: resolved
      .map(({ rule, relationship }) => {
        if (!rule)
          throw new Error("Validated formula rule unexpectedly missing.");
        return {
          ...rule,
          relationship,
          citation: {
            artifactSha256: rule.primaryCitation.artifactSha256,
            sourceRole: rule.primaryCitation.sourceRole,
            locator: rule.primaryCitation.citationLocator,
          },
          supersedesRuleId:
            [...rule.supersessionChain].sort((a, b) => b.ordinal - a.ordinal)[0]
              ?.predecessorRuleId ?? null,
          unresolvedItemIds: [...rule.linkedUnresolvedItemIds],
        };
      })
      .sort((a, b) => compareCodePoint(a.ruleId, b.ruleId)),
    formulaApproval: approval,
    derivationDescription: approval.derivationDescription,
    affectedTestIds: [...approval.affectedTestIds].sort(compareCodePoint),
    regenerationImpact: approval.regenerationImpact,
    validationOracleIds: [...approval.validationOracleIds].sort(
      compareCodePoint,
    ),
  };
}

function governanceKey(cellKey: string, scenarioId: string): string {
  return `${cellKey}\u0000${scenarioId}`;
}
function error(
  code: ValidationError["code"],
  message: string,
  field: string | null,
  formulaId: string | null,
  context: Readonly<Record<string, unknown>>,
): ValidationError {
  return { code, message, field, formulaId, context };
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

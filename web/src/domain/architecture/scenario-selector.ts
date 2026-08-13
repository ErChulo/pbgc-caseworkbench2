import type { EvidenceCatalog } from "../evidence/models";
import type {
  AuthorityOverride,
  Interpretation,
  PlanRuleRecord,
  UnresolvedItem,
} from "../plan-rules/models";
import { planRuleAbsentApplicabilityValue } from "../plan-rules/models";
import {
  validateRuleGovernance,
  validateRuleRecord,
} from "../plan-rules/rule-authoring";
import { createUnresolvedItem } from "../review/unresolved-items";
import { hashTyped } from "../manifests/canonical-json";
import {
  parseSha256,
  parseUuid,
  type Result,
  type Sha256,
  type Uuid,
} from "../shared/types";
import type {
  ArchitectureBuildError,
  DateRange,
  RunDescriptor,
  TriggerCondition,
} from "./models";
import { type RuleSet, type ScenarioSelectionRule } from "./rule-loader";
import type { ArchitecturePopulation } from "./tab-selector";
import { populationDimensions } from "./tab-selector";

export interface AuthenticatedCaseControls {
  readonly controlId: Uuid;
  readonly dimensions: Readonly<Record<string, string | number | boolean>>;
  readonly effectiveDateRange: DateRange;
  readonly reviewStatus: "human-approved" | "provisional";
  readonly approvedBy: string;
  readonly approvalRationale: string;
  readonly caseControlContentSha256: Sha256;
}

export interface ScenarioSelectionDependencies {
  readonly now: () => string;
  readonly uuid: () => string;
}

export interface SelectScenariosInput {
  readonly planRules: readonly PlanRuleRecord[];
  readonly evidenceCatalog: EvidenceCatalog;
  readonly authorityOverrides: readonly AuthorityOverride[];
  readonly caseControls: AuthenticatedCaseControls;
  readonly population?: ArchitecturePopulation;
  readonly scenarioPolicy: Extract<RuleSet, { kind: "scenario-selection" }>;
  readonly dependencies?: ScenarioSelectionDependencies;
}

// Retained as a type-only boundary for the not-yet-migrated architecture builder.
export interface ScenarioSelector {
  readonly select: (
    evidenceDimensions: ReadonlyMap<string, string | number | boolean>,
    caseControlDimensions: ReadonlyMap<string, string | number | boolean>,
    populationDimensions: ReadonlyMap<string, string | number | boolean>,
  ) => readonly string[];
  readonly getScenario: (
    scenarioId: string,
  ) => ScenarioSelectionRule | undefined;
}

const systemDependencies: ScenarioSelectionDependencies = {
  now: () => new Date().toISOString(),
  uuid: () => globalThis.crypto.randomUUID(),
};

export async function caseControlContentHash(
  controls: Omit<AuthenticatedCaseControls, "caseControlContentSha256">,
): Promise<Sha256> {
  const parsed = parseSha256(
    await hashTyped(controls, {
      schemaId: "feature-004-authenticated-case-controls",
      typeName: "AuthenticatedCaseControlsContent",
    }),
  );
  if (!parsed.ok) throw new Error("Case-control SHA-256 computation failed.");
  return parsed.value;
}

export function scenarioPolicyContentHash(
  rules: readonly ScenarioSelectionRule[],
): Sha256 {
  const processValue = (globalThis as { process?: unknown }).process as
    { getBuiltinModule?: (name: string) => unknown } | undefined;
  const crypto =
    processValue !== undefined &&
    typeof processValue.getBuiltinModule === "function"
      ? (processValue.getBuiltinModule("node:crypto") as {
          createHash: (algorithm: string) => {
            update: (
              data: string,
              encoding: "utf8",
            ) => {
              digest: (encoding: "hex") => string;
            };
          };
        })
      : undefined;
  if (crypto === undefined) {
    throw new Error(
      "Synchronous scenario-policy hashing is unavailable without Node crypto.",
    );
  }
  return crypto
    .createHash("sha256")
    .update(stableJson(rules), "utf8")
    .digest("hex") as Sha256;
}

export function evaluateTriggerCondition(
  condition: TriggerCondition,
  planRules: readonly PlanRuleRecord[],
): boolean {
  return planRules.some((rule) => ruleMatchesCondition(rule, condition));
}

export function evaluateExclusionCondition(
  condition: TriggerCondition,
  planRules: readonly PlanRuleRecord[],
): boolean {
  return evaluateTriggerCondition(condition, planRules);
}

export function deriveDateRange(
  planRules: readonly PlanRuleRecord[],
  scenario: ScenarioSelectionRule,
): DateRange | null {
  const governing = applicableRules(planRules, scenario);
  if (governing.length === 0) return null;
  const startDate = governing.reduce(
    (latest, rule) =>
      rule.effectiveDate > latest ? rule.effectiveDate : latest,
    governing[0]?.effectiveDate ?? "",
  );
  const finiteEnds = governing
    .map((rule) => rule.endDate)
    .filter((date): date is string => date !== null);
  const endDate =
    finiteEnds.length === 0
      ? null
      : finiteEnds.reduce((earliest, date) =>
          date < earliest ? date : earliest,
        );
  return endDate !== null && startDate > endDate
    ? null
    : { startDate, endDate };
}

export async function selectScenarios({
  planRules,
  evidenceCatalog,
  authorityOverrides,
  caseControls,
  population = { candidates: [] },
  scenarioPolicy,
  dependencies = systemDependencies,
}: SelectScenariosInput): Promise<
  Result<readonly RunDescriptor[], ArchitectureBuildError>
> {
  if (
    scenarioPolicyContentHash(scenarioPolicy.rules) !==
    scenarioPolicy.policyContentSha256
  ) {
    return failure(
      "INVALID_RULE_SET",
      "Scenario policy content hash is invalid.",
    );
  }
  if (
    caseControls.reviewStatus !== "human-approved" ||
    caseControls.approvedBy.trim() === "" ||
    caseControls.approvalRationale.trim() === "" ||
    (await caseControlContentHash(withoutCaseControlHash(caseControls))) !==
      caseControls.caseControlContentSha256
  ) {
    return failure(
      "INVALID_RULE_SET",
      "Case controls are not authenticated and hash-valid.",
    );
  }

  for (const rule of planRules) {
    const recordValidation = await validateRuleRecord(rule);
    const authorityValidation = recordValidation.ok
      ? await validateRuleGovernance(rule, evidenceCatalog, authorityOverrides)
      : recordValidation;
    if (!authorityValidation.ok) {
      return failure(
        "INVALID_RULE_SET",
        `Plan rule ${rule.ruleId} is not authenticated: ${authorityValidation.error}`,
      );
    }
  }

  const runs: RunDescriptor[] = [];
  const unresolvedItems: UnresolvedItem[] = [];
  const populationOutcomes = population.candidates
    .filter((binding) => binding.governance.status === "approved")
    .map(populationDimensions);
  const populationValues = new Map<string, string | number | boolean>();
  const conflictingPopulationDimensions = new Set<string>();
  for (const outcome of populationOutcomes) {
    for (const [dimension, value] of Object.entries(outcome.dimensions)) {
      if (conflictingPopulationDimensions.has(dimension)) continue;
      const prior = populationValues.get(dimension);
      if (prior === undefined) populationValues.set(dimension, value);
      else if (prior !== value) {
        populationValues.delete(dimension);
        conflictingPopulationDimensions.add(dimension);
      }
    }
  }
  for (const scenario of [...scenarioPolicy.rules].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const caseTriggersMet = scenario.triggerConditions
      .filter((condition) => condition.source === "case-control")
      .every((condition) =>
        valueMatches(caseControls.dimensions[condition.dimension], condition),
      );
    const populationConditions = scenario.triggerConditions.filter(
      (condition) => condition.source === "population",
    );
    const missingPopulation = populationConditions.filter(
      (condition) => !populationValues.has(condition.dimension),
    );
    if (missingPopulation.length > 0) {
      const item = await missingCombinationItem(
        scenario,
        missingPopulation
          .map((condition) => condition.dimension)
          .some((dimension) => conflictingPopulationDimensions.has(dimension))
          ? `Approved population evidence conflicts for required dimension(s): ${missingPopulation.map((condition) => condition.dimension).join(", ")}.`
          : `Missing approved population dimension(s): ${missingPopulation.map((condition) => condition.dimension).join(", ")}.`,
        dependencies,
      );
      if (!item.ok) return failure("HASH_COMPUTATION_FAILED", item.error);
      unresolvedItems.push(item.value);
      continue;
    }
    const populationTriggersMet = populationConditions.every((condition) =>
      valueMatches(populationValues.get(condition.dimension), condition),
    );
    const planConditions = scenario.triggerConditions.filter(
      (condition) => condition.source === "plan-rule",
    );
    const matchedPlanConditions = planConditions.filter((condition) =>
      evaluateTriggerCondition(condition, planRules),
    );
    const governingRules = applicableRules(planRules, scenario);
    if (
      matchedPlanConditions.length > 0 &&
      matchedPlanConditions.length < planConditions.length
    ) {
      const item = await missingCombinationItem(
        scenario,
        `Only ${String(matchedPlanConditions.length)} of ${String(planConditions.length)} plan-rule trigger conditions are supported by the approved rule set.`,
        dependencies,
      );
      if (!item.ok) return failure("HASH_COMPUTATION_FAILED", item.error);
      unresolvedItems.push(item.value);
      continue;
    }
    if (
      !caseTriggersMet ||
      !populationTriggersMet ||
      (planConditions.length > 0 && matchedPlanConditions.length === 0)
    )
      continue;

    const excluded = scenario.exclusionConditions.some((condition) =>
      condition.source === "case-control"
        ? valueMatches(caseControls.dimensions[condition.dimension], condition)
        : condition.source === "plan-rule"
          ? evaluateExclusionCondition(condition, planRules)
          : valueMatches(populationValues.get(condition.dimension), condition),
    );
    if (excluded) continue;

    const conflicts = findConflicts(governingRules);
    if (conflicts.length > 0) {
      for (const conflict of conflicts) {
        const unresolved = await conflictingProvisionItem(
          scenario,
          conflict,
          dependencies,
        );
        if (!unresolved.ok)
          return failure("HASH_COMPUTATION_FAILED", unresolved.error);
        unresolvedItems.push(unresolved.value);
      }
      continue;
    }

    if (governingRules.length === 0) {
      runs.push({
        runId: intervalRunId(scenario.id, caseControls.effectiveDateRange),
        runLabel: scenario.label,
        effectiveDateRange: caseControls.effectiveDateRange,
        justifications: [
          {
            source: "case-control",
            referenceId: caseControls.controlId,
            referenceContentSha256: caseControls.caseControlContentSha256,
          },
        ],
        applicableTabs: [],
      });
      continue;
    }

    const intervals = intersectConditionRuleRanges(planConditions, planRules);
    for (const { range, contributors } of intervals) {
      runs.push({
        runId: intervalRunId(scenario.id, range),
        runLabel: scenario.label,
        effectiveDateRange: range,
        justifications: contributors.map((rule) => ({
          source: "plan-rule" as const,
          referenceId: rule.ruleId,
          referenceContentSha256: rule.ruleContentSha256,
        })),
        applicableTabs: [],
      });
    }
  }

  const sortedRuns = Object.freeze(
    runs.sort((left, right) => left.runId.localeCompare(right.runId)),
  );
  if (unresolvedItems.length > 0)
    return {
      ok: false,
      error: {
        code: "SCENARIO_CONFLICT",
        message:
          "Material scenario combinations are conflicting or incomplete.",
        unresolvedItems,
        partialRuns: sortedRuns,
      },
    };
  return {
    ok: true,
    value: sortedRuns,
  };
}

function intersectConditionRuleRanges(
  conditions: readonly TriggerCondition[],
  rules: readonly PlanRuleRecord[],
): readonly {
  readonly range: DateRange;
  readonly contributors: readonly PlanRuleRecord[];
}[] {
  let combinations: readonly (readonly PlanRuleRecord[])[] = [[]];
  for (const condition of conditions) {
    const matches = rules.filter((rule) =>
      ruleMatchesCondition(rule, condition),
    );
    combinations = combinations.flatMap((combination) =>
      matches.map((rule) => [...combination, rule]),
    );
  }
  const intervals = new Map<
    string,
    { range: DateRange; contributors: Map<string, PlanRuleRecord> }
  >();
  for (const combination of combinations) {
    const contributors = [
      ...new Map(combination.map((rule) => [rule.ruleId, rule])).values(),
    ];
    const range = intersectRanges(
      contributors.map((rule) => ({
        startDate: rule.effectiveDate,
        endDate: rule.endDate,
      })),
    );
    if (range === null) continue;
    const key = `${range.startDate}\u0000${range.endDate ?? ""}`;
    const interval = intervals.get(key) ?? {
      range,
      contributors: new Map<string, PlanRuleRecord>(),
    };
    for (const rule of contributors)
      interval.contributors.set(rule.ruleId, rule);
    intervals.set(key, interval);
  }
  return [...intervals.values()]
    .map(({ range, contributors }) => ({
      range,
      contributors: [...contributors.values()].sort((left, right) =>
        left.ruleId.localeCompare(right.ruleId),
      ),
    }))
    .sort((left, right) =>
      intervalRunId("", left.range).localeCompare(
        intervalRunId("", right.range),
      ),
    );
}

function intersectRanges(ranges: readonly DateRange[]): DateRange | null {
  const startDate = ranges.reduce(
    (latest, range) => (range.startDate > latest ? range.startDate : latest),
    ranges[0]?.startDate ?? "",
  );
  const finiteEnds = ranges.flatMap((range) =>
    range.endDate === null ? [] : [range.endDate],
  );
  const endDate =
    finiteEnds.length === 0
      ? null
      : finiteEnds.reduce((earliest, date) =>
          date < earliest ? date : earliest,
        );
  return endDate !== null && startDate > endDate
    ? null
    : { startDate, endDate };
}

function intervalRunId(scenarioId: string, range: DateRange): string {
  return `${scenarioId}@${range.startDate}..${range.endDate ?? "open"}`;
}

function applicableRules(
  rules: readonly PlanRuleRecord[],
  scenario: ScenarioSelectionRule,
): readonly PlanRuleRecord[] {
  const conditions = scenario.triggerConditions.filter(
    (condition) => condition.source === "plan-rule",
  );
  if (conditions.length === 0) return [];
  if (
    !conditions.every((condition) => evaluateTriggerCondition(condition, rules))
  )
    return [];
  return rules
    .filter((rule) =>
      conditions.some((condition) => ruleMatchesCondition(rule, condition)),
    )
    .sort((left, right) =>
      `${left.effectiveDate}:${left.ruleId}`.localeCompare(
        `${right.effectiveDate}:${right.ruleId}`,
      ),
    );
}

function ruleMatchesCondition(
  rule: PlanRuleRecord,
  condition: TriggerCondition,
): boolean {
  if (condition.source !== "plan-rule") return false;
  const values = rule.applicabilityConditions
    .filter((applicability) => applicability.dimension === condition.dimension)
    .map((applicability) => applicability.value);
  return condition.operator === "absent"
    ? values.some((value) => value === planRuleAbsentApplicabilityValue)
    : values.some((value) => valueMatches(value, condition));
}

function valueMatches(
  actual: string | number | boolean | undefined,
  condition: TriggerCondition,
): boolean {
  switch (condition.operator) {
    case "equals":
      return actual === condition.value;
    case "contains":
      return (
        actual !== undefined && String(actual).includes(String(condition.value))
      );
    case "greater-than":
      return actual !== undefined && Number(actual) > Number(condition.value);
    case "less-than":
      return actual !== undefined && Number(actual) < Number(condition.value);
    case "present":
      return actual !== undefined && actual !== "";
    case "absent":
      return actual === undefined || actual === "";
  }
}

function findConflicts(
  rules: readonly PlanRuleRecord[],
): readonly (readonly [PlanRuleRecord, PlanRuleRecord])[] {
  const conflicts: (readonly [PlanRuleRecord, PlanRuleRecord])[] = [];
  for (const [index, left] of rules.entries()) {
    for (const right of rules.slice(index + 1)) {
      if (
        normalize(left.affectedScope) === normalize(right.affectedScope) &&
        left.governingRestatement.normalize("NFC") !==
          right.governingRestatement.normalize("NFC") &&
        rangesOverlap(left, right)
      ) {
        conflicts.push([left, right]);
      }
    }
  }
  return conflicts;
}

async function conflictingProvisionItem(
  scenario: ScenarioSelectionRule,
  rules: readonly [PlanRuleRecord, PlanRuleRecord],
  dependencies: ScenarioSelectionDependencies,
): Promise<Result<UnresolvedItem, string>> {
  const interpretations: Interpretation[] = [];
  for (const rule of rules) {
    const interpretationId = parseUuid(dependencies.uuid());
    if (!interpretationId.ok)
      return {
        ok: false,
        error: "Injected interpretation identity is invalid.",
      };
    interpretations.push({
      interpretationId: interpretationId.value,
      statement: rule.governingRestatement,
      evidence: [rule.primaryCitation, ...rule.supportingCitations],
      sourceCandidateId: null,
    });
  }
  return createUnresolvedItem(
    {
      kind: "conflicting-provisions",
      affectedScope: `architecture/scenario/${scenario.id}`,
      competingInterpretations: interpretations,
      consequence: `Scenario ${scenario.id} cannot be selected until the contradictory applicable provisions are resolved.`,
      reviewer: null,
      linkedUnresolvedItemIds: rules.flatMap((rule) =>
        rule.linkedUnresolvedItemIds.map(String),
      ),
    },
    dependencies,
  );
}

async function missingCombinationItem(
  scenario: ScenarioSelectionRule,
  statement: string,
  dependencies: ScenarioSelectionDependencies,
): Promise<Result<UnresolvedItem, string>> {
  const ids = [parseUuid(dependencies.uuid()), parseUuid(dependencies.uuid())];
  const first = ids[0];
  const second = ids[1];
  if (first === undefined || second === undefined || !first.ok || !second.ok)
    return { ok: false, error: "Injected interpretation identity is invalid." };
  return createUnresolvedItem(
    {
      kind: "missing-required-value",
      affectedScope: `architecture/scenario/${scenario.id}`,
      competingInterpretations: [
        {
          interpretationId: first.value,
          statement,
          evidence: [],
          sourceCandidateId: null,
        },
        {
          interpretationId: second.value,
          statement:
            "A reviewer supplies a complete, traceable governed combination before scenario selection.",
          evidence: [],
          sourceCandidateId: null,
        },
      ],
      consequence: `Scenario ${scenario.id} cannot be silently selected or omitted while its governed trigger combination is incomplete.`,
      reviewer: null,
    },
    dependencies,
  );
}

function rangesOverlap(left: PlanRuleRecord, right: PlanRuleRecord): boolean {
  return (
    (left.endDate === null || right.effectiveDate <= left.endDate) &&
    (right.endDate === null || left.effectiveDate <= right.endDate)
  );
}

function withoutCaseControlHash(
  controls: AuthenticatedCaseControls,
): Omit<AuthenticatedCaseControls, "caseControlContentSha256"> {
  const { caseControlContentSha256: _hash, ...content } = controls;
  void _hash;
  return content;
}

function normalize(value: string): string {
  return value.trim().normalize("NFC").toLocaleLowerCase("en-US");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function failure(
  code: Exclude<ArchitectureBuildError["code"], "SCENARIO_CONFLICT">,
  message: string,
): Result<never, ArchitectureBuildError> {
  return { ok: false, error: { code, message } as ArchitectureBuildError };
}

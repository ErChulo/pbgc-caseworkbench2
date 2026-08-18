import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { EvidenceCatalog } from "../../../../src/domain/evidence/models";
import type {
  ApplicabilityCondition,
  PlanRuleRecord,
} from "../../../../src/domain/plan-rules/models";
import { authorRule } from "../../../../src/domain/plan-rules/rule-authoring";
import type { Sha256, Uuid } from "../../../../src/domain/shared/types";
import {
  caseControlContentHash,
  deriveDateRange,
  evaluateExclusionCondition,
  evaluateTriggerCondition,
  scenarioPolicyContentHash,
  selectScenarios,
  type AuthenticatedCaseControls,
} from "../../../../src/domain/architecture/scenario-selector";
import type {
  RuleSet,
  ScenarioSelectionRule,
} from "../../../../src/domain/architecture/rule-loader";
import type { ArchitecturePopulation } from "../../../../src/domain/architecture/tab-selector";
import {
  candidate,
  citation,
  evidenceCatalog,
  human,
} from "../plan-rules/governed-fixtures";

const uuid = (label: string): Uuid => {
  const hex = createHash("sha256").update(label).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}` as Uuid;
};

const sourceHash = (label: string): Sha256 =>
  createHash("sha256").update(label).digest("hex") as Sha256;

const condition = (value: string): ApplicabilityCondition => ({
  dimension: "benefit-purpose",
  value,
  evidence: [citation],
});

async function governedRule(
  label: string,
  catalog: EvidenceCatalog,
  value: string,
  effectiveDate: string,
  endDate: string | null = null,
  restatement = `${value} benefit applies.`,
  dimension: ApplicabilityCondition["dimension"] = "benefit-purpose",
): Promise<PlanRuleRecord> {
  const result = await authorRule(
    {
      proposedCandidates: [await candidate(restatement)],
      primaryCitation: citation,
      catalog,
      unresolvedRecords: [],
      authorityOverrides: [],
      governingRestatement: restatement,
      effectiveDate,
      endDate,
      applicabilityConditions: [{ ...condition(value), dimension }],
      requiredApplicabilityDimensions: [dimension],
      affectedScope: `scenario/${value}`,
      reviewer: human,
      approvalRationale: "Approved for deterministic scenario selection tests.",
      confidence: 1,
      ruleSetVersion: "feature-001-plan-rule-v1",
    },
    { uuid: () => uuid(label), now: () => "2026-07-29T12:00:00.000Z" },
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function controls(
  dimensions: Readonly<Record<string, string | number | boolean>> = {},
): Promise<AuthenticatedCaseControls> {
  const content = {
    controlId: uuid("case-controls"),
    dimensions,
    effectiveDateRange: { startDate: "2024-01-01", endDate: null },
    reviewStatus: "human-approved" as const,
    approvedBy: "Synthetic Reviewer",
    approvalRationale: "Approved synthetic case controls.",
  };
  return {
    ...content,
    caseControlContentSha256: await caseControlContentHash(content),
  };
}

function policyRule(
  id: string,
  value: string,
  exclusionConditions: ScenarioSelectionRule["exclusionConditions"] = [],
): ScenarioSelectionRule {
  return {
    id,
    label: `${id} calculation`,
    triggerConditions: [
      {
        dimension: "benefit-purpose",
        operator: "equals",
        value,
        source: "plan-rule",
      },
    ],
    exclusionConditions,
    defaultEffectiveDateRange: { startDate: "1900-01-01", endDate: null },
  };
}

async function approvedPolicy(
  rules: readonly ScenarioSelectionRule[],
): Promise<Extract<RuleSet, { kind: "scenario-selection" }>> {
  const policyContentSha256 = await scenarioPolicyContentHash(rules);
  return {
    kind: "scenario-selection",
    version: "1.0.0",
    rules,
    policyContentSha256,
    sourceFileSha256: sourceHash(JSON.stringify(rules)),
    governance: {
      reviewStatus: "provisional",
    },
  };
}

describe("governed scenario selection", () => {
  it("selects from an authenticated rule and preserves its real justification", async () => {
    const catalog = await evidenceCatalog();
    const rule = await governedRule(
      "normal-rule",
      catalog,
      "normal",
      "2020-03-15",
    );
    const result = await selectScenarios({
      planRules: [rule],
      evidenceCatalog: catalog,
      authorityOverrides: [],
      caseControls: await controls(),
      scenarioPolicy: await approvedPolicy([policyRule("NRD", "normal")]),
    });

    expect(result).toEqual({
      ok: true,
      value: [
        {
          runId: "NRD@2020-03-15..open",
          runLabel: "NRD calculation",
          effectiveDateRange: { startDate: "2020-03-15", endDate: null },
          justifications: [
            {
              source: "plan-rule",
              referenceId: rule.ruleId,
              referenceContentSha256: rule.ruleContentSha256,
            },
          ],
          applicableTabs: [],
        },
      ],
    });
  });

  it("evaluates plan-rule triggers and exclusions deterministically", async () => {
    const catalog = await evidenceCatalog();
    const rule = await governedRule(
      "early-rule",
      catalog,
      "early",
      "2021-01-01",
    );
    const trigger = policyRule("ERD", "early").triggerConditions.at(0);
    if (trigger === undefined) throw new Error("Test policy lacks a trigger.");
    expect(evaluateTriggerCondition(trigger, [rule])).toBe(true);
    expect(evaluateExclusionCondition(trigger, [rule])).toBe(true);
    expect(
      evaluateTriggerCondition(
        {
          dimension: "freeze-or-restriction",
          operator: "absent",
          value: true,
          source: "plan-rule",
        },
        [rule],
      ),
    ).toBe(false);

    const result = await selectScenarios({
      planRules: [rule],
      evidenceCatalog: catalog,
      authorityOverrides: [],
      caseControls: await controls({ blocked: true }),
      scenarioPolicy: await approvedPolicy([
        policyRule("ERD", "early", [
          {
            dimension: "blocked",
            operator: "equals",
            value: true,
            source: "case-control",
          },
        ]),
      ]),
    });
    expect(result).toEqual({ ok: true, value: [] });
  });

  it("requires explicit governed negative evidence for plan-rule absence", async () => {
    const catalog = await evidenceCatalog();
    const unrelated = await governedRule(
      "absence-unknown",
      catalog,
      "normal",
      "2019-01-01",
    );
    const explicitAbsence = await governedRule(
      "absence-explicit",
      catalog,
      "absent",
      "2020-01-01",
      null,
      "The governed restriction is absent.",
      "freeze-or-restriction",
    );
    const absenceCondition = {
      dimension: "freeze-or-restriction",
      operator: "absent" as const,
      value: true,
      source: "plan-rule" as const,
    };

    expect(evaluateTriggerCondition(absenceCondition, [unrelated])).toBe(false);
    expect(evaluateTriggerCondition(absenceCondition, [explicitAbsence])).toBe(
      true,
    );

    const result = await selectScenarios({
      planRules: [unrelated, explicitAbsence],
      evidenceCatalog: catalog,
      authorityOverrides: [],
      caseControls: await controls(),
      scenarioPolicy: await approvedPolicy([
        {
          ...policyRule("NO-RESTRICTION", "unused"),
          triggerConditions: [absenceCondition],
        },
      ]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.justifications).toEqual([
      {
        source: "plan-rule",
        referenceId: explicitAbsence.ruleId,
        referenceContentSha256: explicitAbsence.ruleContentSha256,
      },
    ]);
  });

  it("derives historical ranges only from governing rule dates, not policy defaults", async () => {
    const catalog = await evidenceCatalog();
    const first = await governedRule(
      "range-one",
      catalog,
      "death",
      "1998-04-01",
      "2005-12-31",
    );
    const second = await governedRule(
      "range-two",
      catalog,
      "death",
      "2006-01-01",
    );
    const scenario = policyRule("DOR", "death");
    expect(deriveDateRange([first], scenario)).toEqual({
      startDate: "1998-04-01",
      endDate: "2005-12-31",
    });

    const result = await selectScenarios({
      planRules: [second, first],
      evidenceCatalog: catalog,
      authorityOverrides: [],
      caseControls: await controls(),
      scenarioPolicy: await approvedPolicy([scenario]),
    });
    expect(
      result.ok && result.value.map((run) => run.effectiveDateRange),
    ).toEqual([
      { startDate: "1998-04-01", endDate: "2005-12-31" },
      { startDate: "2006-01-01", endDate: null },
    ]);
  });

  it("satisfies split plan-rule triggers across the complete rule set and traces every contributor", async () => {
    const catalog = await evidenceCatalog();
    const benefit = await governedRule(
      "split-benefit",
      catalog,
      "normal",
      "2020-01-01",
    );
    const age = await governedRule(
      "split-age",
      catalog,
      "age-65",
      "2021-01-01",
    );
    const scenario = policyRule("NRD", "normal");
    const splitScenario = {
      ...scenario,
      triggerConditions: [
        ...scenario.triggerConditions,
        {
          dimension: "benefit-purpose",
          operator: "equals" as const,
          value: "age-65",
          source: "plan-rule" as const,
        },
      ],
    };
    const result = await selectScenarios({
      planRules: [age, benefit],
      evidenceCatalog: catalog,
      authorityOverrides: [],
      caseControls: await controls(),
      scenarioPolicy: await approvedPolicy([splitScenario]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.runId).toBe("NRD@2021-01-01..open");
    expect(result.value[0]?.effectiveDateRange).toEqual({
      startDate: "2021-01-01",
      endDate: null,
    });
    expect(
      result.value[0]?.justifications.map((item) => item.referenceId).sort(),
    ).toEqual([age.ruleId, benefit.ruleId].sort());
  });

  it("emits unique historical runs from split-rule date intersections", async () => {
    const catalog = await evidenceCatalog();
    const normalHistorical = await governedRule(
      "normal-historical",
      catalog,
      "normal",
      "2000-01-01",
      "2005-12-31",
    );
    const normalCurrent = await governedRule(
      "normal-current",
      catalog,
      "normal",
      "2006-01-01",
    );
    const age = await governedRule(
      "age-window",
      catalog,
      "age-65",
      "2003-01-01",
      "2008-12-31",
    );
    const result = await selectScenarios({
      planRules: [normalCurrent, age, normalHistorical],
      evidenceCatalog: catalog,
      authorityOverrides: [],
      caseControls: await controls(),
      scenarioPolicy: await approvedPolicy([
        {
          ...policyRule("NRD", "normal"),
          triggerConditions: [
            ...policyRule("NRD", "normal").triggerConditions,
            {
              dimension: "benefit-purpose",
              operator: "equals",
              value: "age-65",
              source: "plan-rule",
            },
          ],
        },
      ]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((run) => run.runId)).toEqual([
      "NRD@2003-01-01..2005-12-31",
      "NRD@2006-01-01..2008-12-31",
    ]);
    expect(result.value.map((run) => run.justifications.length)).toEqual([
      2, 2,
    ]);
    expect(new Set(result.value.map((run) => run.runId)).size).toBe(2);
  });

  it("uses governed population exclusions and emits missing combinations", async () => {
    const catalog = await evidenceCatalog();
    const rule = await governedRule(
      "population-rule",
      catalog,
      "survivor",
      "2020-01-01",
    );
    const excluded = await selectScenarios({
      planRules: [rule],
      evidenceCatalog: catalog,
      authorityOverrides: [],
      caseControls: await controls(),
      population: populationDimension("participant-status", "retired"),
      scenarioPolicy: await approvedPolicy([
        policyRule("QPSA", "survivor", [
          {
            dimension: "participant-status",
            operator: "equals",
            value: "retired",
            source: "population",
          },
        ]),
      ]),
    });
    expect(excluded).toEqual({ ok: true, value: [] });

    const missing = await selectScenarios({
      planRules: [rule],
      evidenceCatalog: catalog,
      authorityOverrides: [],
      caseControls: await controls(),
      population: populationDimension("participant-status", "retired"),
      scenarioPolicy: await approvedPolicy([
        {
          ...policyRule("QPSA", "survivor"),
          triggerConditions: [
            ...policyRule("QPSA", "survivor").triggerConditions,
            {
              dimension: "survivor-status",
              operator: "present",
              value: true,
              source: "population",
            },
          ],
        },
      ]),
    });
    expect(!missing.ok && missing.error.code).toBe("SCENARIO_CONFLICT");
  });

  it("emits a conflicting-provisions unresolved item and does not select", async () => {
    const catalog = await evidenceCatalog();
    const left = await governedRule(
      "conflict-left",
      catalog,
      "survivor",
      "2020-01-01",
      null,
      "Survivor benefit is payable.",
    );
    const rightBase = await governedRule(
      "conflict-right",
      catalog,
      "survivor",
      "2021-01-01",
      null,
      "Survivor benefit is not payable.",
    );
    const right = { ...rightBase, affectedScope: left.affectedScope };
    const { ruleContentSha256: _oldHash, ...rightPayload } = right;
    void _oldHash;
    const reauthored =
      await import("../../../../src/domain/plan-rules/rule-authoring");
    const validRight = {
      ...right,
      ruleContentSha256: await reauthored.ruleContentHash(rightPayload),
    };
    const ids = [
      "interpretation-left",
      "interpretation-right",
      "unresolved-item",
    ].map(uuid);
    let index = 0;
    const result = await selectScenarios({
      planRules: [left, validRight],
      evidenceCatalog: catalog,
      authorityOverrides: [],
      caseControls: await controls(),
      scenarioPolicy: await approvedPolicy([policyRule("QPSA", "survivor")]),
      dependencies: {
        uuid: () => {
          const value = ids[index];
          if (value === undefined)
            throw new Error("Test identity sequence exhausted.");
          index += 1;
          return value;
        },
        now: () => "2026-07-29T13:00:00.000Z",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCENARIO_CONFLICT");
    expect(result.error.code).toBe("SCENARIO_CONFLICT");
    if (result.error.code !== "SCENARIO_CONFLICT") return;
    expect(result.error.unresolvedItems[0]).toMatchObject({
      itemId: ids[2],
      kind: "conflicting-provisions",
      status: "open",
    });
  });

  it("rejects tampered policy, plan-rule, and case-control hashes", async () => {
    const catalog = await evidenceCatalog();
    const rule = await governedRule(
      "tamper-rule",
      catalog,
      "normal",
      "2020-01-01",
    );
    const scenarioPolicy = await approvedPolicy([policyRule("NRD", "normal")]);
    const caseControls = await controls();

    const tamperedPolicy = await selectScenarios({
      planRules: [rule],
      evidenceCatalog: catalog,
      authorityOverrides: [],
      caseControls,
      scenarioPolicy: {
        ...scenarioPolicy,
        rules: [policyRule("ERD", "early")],
      },
    });
    const tamperedRule = await selectScenarios({
      planRules: [{ ...rule, governingRestatement: "Tampered." }],
      evidenceCatalog: catalog,
      authorityOverrides: [],
      caseControls,
      scenarioPolicy,
    });
    const tamperedControls = await selectScenarios({
      planRules: [rule],
      evidenceCatalog: catalog,
      authorityOverrides: [],
      caseControls: { ...caseControls, dimensions: { changed: true } },
      scenarioPolicy,
    });
    expect(
      [tamperedPolicy, tamperedRule, tamperedControls].every(
        (value) => !value.ok,
      ),
    ).toBe(true);
  });

  it("replays deterministic scenario content for identical governed inputs", async () => {
    const catalog = await evidenceCatalog();
    const rule = await governedRule(
      "replay-rule",
      catalog,
      "early",
      "2018-07-01",
    );
    const input = {
      planRules: [rule],
      evidenceCatalog: catalog,
      authorityOverrides: [],
      caseControls: await controls(),
      scenarioPolicy: await approvedPolicy([policyRule("ERD", "early")]),
    };
    expect(JSON.stringify(await selectScenarios(input))).toBe(
      JSON.stringify(await selectScenarios(input)),
    );
  });
});

function populationDimension(
  dimension: string,
  value: string | number | boolean,
): ArchitecturePopulation {
  return {
    candidates: [
      {
        candidate: {
          candidateKey: sourceHash("population"),
          artifactSha256: sourceHash("population-artifact"),
          candidateStatus: "proposed",
          detectorIdentity: "synthetic",
          detectorVersion: "1.0.0",
          confidence: 1,
          evidence: [
            {
              evidenceKey: sourceHash("population-evidence"),
              citationId: "population-characteristic",
              artifactSha256: sourceHash("population-artifact"),
              sourceLocator: "synthetic:population",
              evidenceKind: "population-characteristic",
              observedTextOrValue: { dimension, value },
            },
          ],
          observedFields: [],
          recordCounts: [],
          sensitivity: "synthetic-mock",
          correctionsOrImputationsApplied: false,
        },
        governance: {
          status: "approved",
          effectiveDecisionId: "synthetic-approval",
          effectiveWorkbookProfileContentSha256: sourceHash("profile"),
          provenance: ["synthetic-approval"],
        },
        workbook: {
          status: "profiled",
          sheets: [],
          formulaExecutionCount: 0,
          limitations: [],
        },
        workbookProfileContentSha256: sourceHash("profile"),
      },
    ],
  };
}

import type { Uuid } from "../shared/types";
import type {
  PlanRule,
  RuleVersion,
  AuditEvent,
  WorkbookRuleContext,
  RuleApplicabilityMatch,
} from "./models";

export interface RuleQueryOptions {
  readonly effectiveDate?: string;
  readonly applicability?: string;
  readonly classification?: string;
  readonly status?: "all" | "effective" | "superseded";
}

export function queryRules(
  rules: readonly PlanRule[],
  options: RuleQueryOptions = {},
): PlanRule[] {
  let result = [...rules];

  if (options.effectiveDate) {
    const effDate = options.effectiveDate;
    result = result.filter(
      (rule) =>
        rule.effectiveDate <= effDate &&
        (!rule.endDate || rule.endDate > effDate),
    );
  }

  if (options.applicability) {
    const appLower = options.applicability.toLowerCase();
    result = result.filter((rule) => {
      const ruleAppLower = rule.applicability.toLowerCase();
      return ruleAppLower.includes(appLower) || appLower.includes(ruleAppLower);
    });
  }

  if (options.status === "effective" && options.effectiveDate) {
    const effDate = options.effectiveDate;
    result = result.filter(
      (rule) =>
        rule.effectiveDate <= effDate &&
        (!rule.endDate || rule.endDate > effDate),
    );
  } else if (options.status === "superseded") {
    result = result.filter((rule) => rule.endDate !== undefined);
  }

  return result.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export function findRuleById(
  rules: readonly PlanRule[],
  ruleId: Uuid,
): PlanRule | null {
  return rules.find((r) => r.ruleId === ruleId) ?? null;
}

export function findRulesByApplicability(
  rules: readonly PlanRule[],
  applicability: string,
): PlanRule[] {
  const appLower = applicability.toLowerCase();
  return rules
    .filter((rule) => rule.applicability.toLowerCase().includes(appLower))
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export function getRulesEffectiveOn(
  rules: readonly PlanRule[],
  date: string,
): PlanRule[] {
  return rules
    .filter(
      (rule) =>
        rule.effectiveDate <= date && (!rule.endDate || rule.endDate > date),
    )
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export function getRulesApplicableTo(
  rules: readonly PlanRule[],
  classification: string,
): PlanRule[] {
  const classLower = classification.toLowerCase();
  return rules
    .filter((rule) => {
      const ruleAppLower = rule.applicability.toLowerCase();
      return (
        ruleAppLower.includes(classLower) || classLower.includes(ruleAppLower)
      );
    })
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export function getApplicableRulesForWorkbook(
  rules: readonly PlanRule[],
  effectiveDate: string,
  classification: string,
): WorkbookRuleContext {
  const effectiveRules = getRulesEffectiveOn(rules, effectiveDate);
  const applicableRules = getRulesApplicableTo(effectiveRules, classification);

  return {
    effectiveDate,
    applicableRuleIds: applicableRules.map((r) => r.ruleId),
    classificationRationale:
      "Rules effective on " +
      effectiveDate +
      " applicable to " +
      classification,
  };
}

export function matchRulesToClassification(
  rules: readonly PlanRule[],
  classification: string,
): RuleApplicabilityMatch[] {
  const classLower = classification.toLowerCase();
  const matches = rules
    .filter((rule) => {
      const ruleAppLower = rule.applicability.toLowerCase();
      return (
        ruleAppLower.includes(classLower) || classLower.includes(ruleAppLower)
      );
    })
    .map((rule): RuleApplicabilityMatch => ({
      ruleId: rule.ruleId,
      applicability: rule.applicability,
      effectiveDate: rule.effectiveDate,
      endDate: rule.endDate,
      matchScore: calculateMatchScore(classification, rule.applicability),
    }))
    .sort((a, b) => b.matchScore - a.matchScore);

  return matches;
}

function calculateMatchScore(
  classification: string,
  applicability: string,
): number {
  const classLower = classification.toLowerCase();
  const appLower = applicability.toLowerCase();

  if (classLower === appLower) return 100;
  if (appLower.includes(classLower)) return 80;
  if (classLower.includes(appLower)) return 60;
  if (appLower.split(" ").some((w) => classLower.includes(w))) return 40;
  return 20;
}

export function getRuleVersion(
  versions: readonly RuleVersion[],
  ruleId: Uuid,
  version?: string,
): RuleVersion | null {
  const ruleVersions = versions.filter((v) => v.ruleId === ruleId);
  if (ruleVersions.length === 0) return null;

  if (version) {
    return ruleVersions.find((v) => v.version === version) ?? null;
  }

  return ruleVersions.reduce((latest, current) =>
    compareVersions(current.version, latest.version) > 0 ? current : latest,
  );
}

export function getRuleVersionHistory(
  versions: readonly RuleVersion[],
  ruleId: Uuid,
): RuleVersion[] {
  return versions
    .filter((v) => v.ruleId === ruleId)
    .sort((a, b) => compareVersions(b.version, a.version));
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);

  if (aParts.length < 3 || bParts.length < 3) return 0;

  for (let i = 0; i < 3; i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];
    if (aPart !== undefined && bPart !== undefined && aPart !== bPart) {
      return aPart - bPart;
    }
  }
  return 0;
}

export function getApprovalsForRuleVersion(
  approvals: readonly import("./models").ApprovalDecision[],
  ruleVersionId: string,
): import("./models").ApprovalDecision[] {
  return approvals
    .filter((a) => a.ruleVersionId === ruleVersionId)
    .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
}

export function getAuditEventsForRule(
  events: readonly AuditEvent[],
  ruleId: Uuid,
): AuditEvent[] {
  return events
    .filter((e) => e.ruleId === ruleId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

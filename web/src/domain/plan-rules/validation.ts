import type { ValidationError, ValidationWarning } from "../shared/validation-result";
import type { PlanRule, RuleVersion } from "./models";
import type { PopulationDecisionProjection } from "../population/population-profile";

export interface ValidationContext {
  readonly rules: readonly PlanRule[];
  readonly ruleVersions: readonly RuleVersion[];
  readonly population: PopulationDecisionProjection;
  readonly caseApproverId: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
}

export function validateRuleSet(
  context: ValidationContext,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const effectiveRules = context.rules.filter((rule) => {
    if (!rule.endDate) return true;
    return rule.effectiveDate <= "9999-12-31" && (rule.endDate ?? "") > "1900-01-01";
  });

  if (effectiveRules.length === 0) {
    warnings.push({
      code: "NO_EFFECTIVE_RULES",
      severity: "warning",
      affectedCells: [],
      message: "No rules are effective for the given population date",
      detail: "The population date does not fall within any rule's effective period",
    });
  }

  const classificationCounts: Record<string, number> = {};
  for (const rule of effectiveRules) {
    const classifications = rule.applicability.split(",").map((c) => c.trim());
    for (const classification of classifications) {
      classificationCounts[classification] = (classificationCounts[classification] ?? 0) + 1;
    }
  }

  for (const [classification, count] of Object.entries(classificationCounts)) {
    if (count > 1) {
      warnings.push({
        code: "OVERLAPPING_APPLICABILITY",
        severity: "warning",
        affectedCells: [],
        message: "Classification " + classification + " has " + String(count) + " overlapping rules",
        detail: "Multiple rules apply to the same classification. Verify rule precedence.",
      });
    }
  }

  const approverRules = effectiveRules.filter((rule) => rule.createdBy !== context.caseApproverId);
  if (approverRules.length > 0) {
    warnings.push({
      code: "UNAPPROVED_RULE_AUTHOR",
      severity: "warning",
      affectedCells: [],
      message: "Some rules were created by non-approver authors",
      detail: String(approverRules.length) + " rules have authors different from the case approver",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validatePopulationApplicability(
  _population: PopulationDecisionProjection,
  rules: readonly PlanRule[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const effectiveRules = rules.filter((rule) => {
    if (!rule.endDate) return true;
    return rule.effectiveDate <= "9999-12-31" && (rule.endDate ?? "") > "1900-01-01";
  });

  if (effectiveRules.length === 0) {
    errors.push({
      code: "NO_EFFECTIVE_RULES_FOR_POPULATION",
      severity: "error",
      affectedCells: [],
      affectedNames: [],
      message: "No effective rules available for population",
      detail: "No rules are effective for the current date range",
      remediation: "Ensure at least one rule has an effective date range covering the population",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateRuleVersions(
  versions: readonly import("./models").RuleVersion[],
  rules: readonly import("./models").PlanRule[],
): { valid: boolean; errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const versionMap = new Map<string, number>();
  for (const version of versions) {
    const key = version.ruleId + ":" + version.version;
    const existing = versionMap.get(key);
    if (existing) {
      errors.push({
        code: "DUPLICATE_RULE_VERSION",
        severity: "error",
        affectedCells: [],
        affectedNames: [],
        message: "Duplicate version " + version.version + " for rule " + version.ruleId,
        detail: "Each rule must have unique versions",
        remediation: "Remove duplicate version or increment version number",
      });
    }
    versionMap.set(key, 1);
  }

  for (const rule of rules) {
    const ruleVersions = versions.filter((v) => v.ruleId === rule.ruleId);
    if (ruleVersions.length === 0) {
      warnings.push({
        code: "RULE_WITHOUT_VERSION",
        severity: "warning",
        affectedCells: [],
        message: "Rule " + rule.ruleId + " has no version records",
        detail: "Every rule should have at least one version record",
      });
    } else if (ruleVersions.length === 1) {
      const singleVersion = ruleVersions[0];
      if (singleVersion && singleVersion.version !== "1.0.0") {
        warnings.push({
          code: "NON_INITIAL_VERSION",
          severity: "warning",
          affectedCells: [],
          message: "Rule " + rule.ruleId + " has non-initial version " + singleVersion.version + " as only version",
          detail: "First version of a rule should typically be 1.0.0",
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateApprovalCompleteness(
  approvals: readonly import("./models").ApprovalDecision[],
  _rules: readonly import("./models").PlanRule[],
  ruleVersions: readonly import("./models").RuleVersion[],
): { valid: boolean; errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const approvedVersions = new Set<string>();
  for (const approval of approvals) {
    if (approval.status === "approved") {
      approvedVersions.add(approval.ruleVersionId);
    }
  }

  for (const version of ruleVersions) {
    if (!approvedVersions.has(version.ruleVersionId)) {
      warnings.push({
        code: "UNAPPROVED_RULE_VERSION",
        severity: "warning",
        affectedCells: [],
        message: "Rule version " + version.version + " of rule " + version.ruleId + " is not approved",
        detail: "Unapproved rule versions cannot be used in workbook generation",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function combineValidationResults(
  ...results: { valid: boolean; errors: readonly ValidationError[]; warnings: readonly ValidationWarning[] }[]
): { valid: boolean; errors: ValidationError[]; warnings: ValidationWarning[] } {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationWarning[] = [];

  for (const result of results) {
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  const uniqueErrors = Array.from(
    new Map(allErrors.map((e) => [e.code + ":" + e.message, e])).values(),
  ).sort((a, b) => a.code.localeCompare(b.code));

  const uniqueWarnings = Array.from(
    new Map(allWarnings.map((w) => [w.code + ":" + w.message, w])).values(),
  ).sort((a, b) => a.code.localeCompare(b.code));

  return {
    valid: uniqueErrors.length === 0,
    errors: uniqueErrors,
    warnings: uniqueWarnings,
  };
}
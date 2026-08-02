import { describe, expect, it } from "vitest";

import { createPlanRule } from "../../src/domain/plan-rules/rule-engine";
import { createRuleVersion } from "../../src/domain/plan-rules/rule-engine";
import { recordApprovalDecision } from "../../src/domain/plan-rules/rule-engine";
import {
  compareVersions,
  getNextPatchVersion,
  getNextMajorVersion,
} from "../../src/domain/plan-rules/rule-versioning";
import {
  validateApprovalAuthority,
  validateApprovalInput,
  recordApprovalDecision as recordApprovalDecisionApproval,
  getApprovalStatus,
  isRuleApproved,
} from "../../src/domain/plan-rules/rule-approval";
import {
  createAuditEvent,
  appendAuditEvent,
  createAuditLog,
  getAuditSummary,
  verifyAuditLogIntegrity,
} from "../../src/domain/plan-rules/audit-log";
import {
  queryRules,
  getRulesEffectiveOn,
  getApplicableRulesForWorkbook,
} from "../../src/domain/plan-rules/rule-query";
import {
  validateRuleSet,
  validatePopulationApplicability,
  validateRuleVersions,
  validateApprovalCompleteness,
  combineValidationResults,
} from "../../src/domain/plan-rules/validation";

type Ts = import("../../src/domain/shared/types").UtcTimestamp;
const ts = (s: string): Ts => s as Ts;

const population = {
  effectiveDate: "2024-06-01",
  classifications: ["participant-group"],
} as never;

describe("Feature 002 governance workflow integration", () => {
  it("full lifecycle: author, version, approve, audit, validate", async () => {
    const now = ts("2024-01-01T00:00:00.000Z");

    const rule = await createPlanRule({
      statement: "Monthly benefit equals accrued benefit.",
      effectiveDate: "2024-01-01",
      applicability: "participant-group",
      primaryCitation: {
        sourceType: "plan-document",
        locator: "Article 4, Section 2",
        date: "2023-06-15",
      },
      createdBy: "author-1",
      createdAt: now,
    });

    expect(rule.ruleId).toBeDefined();
    expect(rule.ruleContentSha256).toMatch(/^[0-9a-f]{64}$/u);

    const version = await createRuleVersion({
      ruleId: rule.ruleId,
      version: "1.0.0",
      statement: rule.statement,
      createdBy: "author-1",
      createdAt: now,
    });

    expect(version.ruleId).toBe(rule.ruleId);
    expect(version.version).toBe("1.0.0");

    const approvalInput = {
      caseApproverId: "approver-1",
      ruleVersion: version,
      approverId: "approver-1",
      approvedAt: ts("2024-01-02T00:00:00.000Z"),
      status: "approved" as const,
      rationale: "Verified against plan document.",
      evidence: ["evidence-ref-1"],
    };

    const authorityCheck = validateApprovalAuthority(
      approvalInput.approverId,
      approvalInput.caseApproverId,
    );
    expect(authorityCheck.valid).toBe(true);

    const inputCheck = validateApprovalInput(approvalInput);
    expect(inputCheck.valid).toBe(true);

    const approval = await recordApprovalDecisionApproval(approvalInput);
    expect(approval.status).toBe("approved");
    expect(approval.ruleVersionId).toBe(version.ruleVersionId);

    const event = await createAuditEvent({
      ruleId: rule.ruleId,
      action: "approved",
      actor: "approver-1",
      rationale: "Rule approved for production use.",
      timestamp: ts("2024-01-02T00:00:00.000Z"),
    });

    const log = appendAuditEvent(createAuditLog(), event);
    expect(log.events.length).toBe(1);

    const summary = getAuditSummary(log);
    expect(summary.totalEvents).toBe(1);
    expect(summary.byAction.approved).toBe(1);

    const integrity = verifyAuditLogIntegrity(log);
    expect(integrity.valid).toBe(true);

    expect(getApprovalStatus([approval], version.ruleVersionId)).toBe(
      "approved",
    );
    expect(isRuleApproved([approval], version.ruleVersionId)).toBe(true);
  });

  it("validates rule set with effective rules and approvals", async () => {
    const rule = await createPlanRule({
      statement: "Benefit accrual rate applies to eligible participants.",
      effectiveDate: "2024-01-01",
      applicability: "participant-group",
      primaryCitation: {
        sourceType: "plan-document",
        locator: "Article 5",
        date: "2023-06-15",
      },
      createdBy: "author-1",
      createdAt: ts("2024-01-01T00:00:00.000Z"),
    });

    const version = await createRuleVersion({
      ruleId: rule.ruleId,
      version: "1.0.0",
      statement: rule.statement,
      createdBy: "author-1",
      createdAt: ts("2024-01-01T00:00:00.000Z"),
    });

    const approval = await recordApprovalDecision({
      ruleVersionId: version.ruleVersionId,
      approvedBy: "approver-1",
      approvedAt: ts("2024-01-02T00:00:00.000Z"),
      status: "approved",
      rationale: "Approved.",
      evidence: ["evidence-ref-1"],
    });

    const ruleSetResult = validateRuleSet({
      rules: [rule],
      ruleVersions: [version],
      population,
      caseApproverId: "approver-1",
    });
    expect(
      ruleSetResult.warnings.some((w) => w.code === "NO_EFFECTIVE_RULES"),
    ).toBe(false);

    const populationResult = validatePopulationApplicability(population, [
      rule,
    ]);
    expect(populationResult.valid).toBe(true);

    const versionResult = validateRuleVersions([version], [rule]);
    expect(
      versionResult.errors.some((e) => e.code === "DUPLICATE_RULE_VERSION"),
    ).toBe(false);

    const approvalResult = validateApprovalCompleteness(
      [approval],
      [rule],
      [version],
    );
    expect(
      approvalResult.warnings.some((w) => w.code === "UNAPPROVED_RULE_VERSION"),
    ).toBe(false);

    const combined = combineValidationResults(
      ruleSetResult,
      populationResult,
      versionResult,
      approvalResult,
    );
    expect(combined.valid).toBe(true);
  });

  it("queries rules by date and applicability", async () => {
    const rule1 = await createPlanRule({
      statement: "Rule effective 2024.",
      effectiveDate: "2024-01-01",
      applicability: "participant-group",
      primaryCitation: {
        sourceType: "plan-document",
        locator: "Art 1",
        date: "2023-01-01",
      },
      createdBy: "author-1",
      createdAt: ts("2024-01-01T00:00:00.000Z"),
    });

    const rule2 = await createPlanRule({
      statement: "Rule effective 2025.",
      effectiveDate: "2025-01-01",
      applicability: "participant-group",
      primaryCitation: {
        sourceType: "plan-document",
        locator: "Art 2",
        date: "2024-01-01",
      },
      createdBy: "author-1",
      createdAt: ts("2025-01-01T00:00:00.000Z"),
    });

    const effectiveOnDate = getRulesEffectiveOn([rule1, rule2], "2024-06-15");
    expect(effectiveOnDate.length).toBe(1);
    expect(effectiveOnDate[0]?.ruleId).toBe(rule1.ruleId);

    const workbookContext = getApplicableRulesForWorkbook(
      [rule1, rule2],
      "2024-06-15",
      "participant-group",
    );
    expect(workbookContext.applicableRuleIds.length).toBe(1);

    const filtered = queryRules([rule1, rule2], {
      effectiveDate: "2024-06-15",
    });
    expect(filtered.length).toBe(1);
  });

  it("versions are compared and incremented correctly", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.0.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);

    expect(getNextPatchVersion("1.0.0")).toBe("1.0.1");
    expect(getNextMajorVersion("1.0.0")).toBe("2.0.0");
  });

  it("audit log tracks full governance history", async () => {
    const ruleId = (
      await createPlanRule({
        statement: "Audit trail test rule.",
        effectiveDate: "2024-01-01",
        applicability: "participant-group",
        primaryCitation: {
          sourceType: "plan-document",
          locator: "Art 1",
          date: "2023-01-01",
        },
        createdBy: "author-1",
        createdAt: ts("2024-01-01T00:00:00.000Z"),
      })
    ).ruleId;

    const created = await createAuditEvent({
      ruleId,
      action: "created",
      actor: "author-1",
      rationale: "Rule authored.",
      timestamp: ts("2024-01-01T00:00:00.000Z"),
    });

    const approved = await createAuditEvent({
      ruleId,
      action: "approved",
      actor: "approver-1",
      rationale: "Rule approved.",
      timestamp: ts("2024-01-02T00:00:00.000Z"),
    });

    const log = appendAuditEvent(
      appendAuditEvent(createAuditLog(), created),
      approved,
    );
    expect(log.events.length).toBe(2);

    const summary = getAuditSummary(log);
    expect(summary.totalEvents).toBe(2);
    expect(summary.byAction.created).toBe(1);
    expect(summary.byAction.approved).toBe(1);
    expect(summary.byActor["author-1"]).toBe(1);
    expect(summary.byActor["approver-1"]).toBe(1);

    const integrity = verifyAuditLogIntegrity(log);
    expect(integrity.valid).toBe(true);
  });
});

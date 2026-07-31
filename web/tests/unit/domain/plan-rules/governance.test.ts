import { describe, expect, it } from "vitest";

import {
  createPlanRule,
  createRuleVersion,
  recordAuditEvent,
  validateSemanticVersion,
  isRuleEffectiveOn,
  matchesApplicability,
} from "../../../../src/domain/plan-rules/rule-engine";

import {
  compareVersions,
  getNextPatchVersion,
  getNextMinorVersion,
  getNextMajorVersion,
  validateSupersessionChain,
  computeRuleVersionHash,
  createSupersessionLink,
} from "../../../../src/domain/plan-rules/rule-versioning";

import type { SupersessionLink } from "../../../../src/domain/plan-rules/rule-versioning";

import {
  validateApprovalAuthority,
  validateApprovalInput,
  createApprovalAuditEvent,
  getApprovalStatus,
  isRuleApproved,
  getLatestApproval,
  getApprovalHistory,
} from "../../../../src/domain/plan-rules/rule-approval";

import {
  queryRules,
  findRuleById,
  findRulesByApplicability,
  getRulesEffectiveOn,
  getRulesApplicableTo,
  getApplicableRulesForWorkbook,
  matchRulesToClassification,
  getRuleVersion,
  getRuleVersionHistory,
  getAuditEventsForRule as getAuditEventsForRuleFromQuery,
} from "../../../../src/domain/plan-rules/rule-query";

import {
  createAuditEvent,
  appendAuditEvent,
  createAuditLog,
  getAuditEventsByActor,
  getAuditEventsByAction,
  getAuditEventsInRange,
  getAuditEventById,
  verifyAuditLogIntegrity,
  getAuditSummary,
} from "../../../../src/domain/plan-rules/audit-log";

import {
  validateRuleSet,
  validatePopulationApplicability,
  validateRuleVersions,
  validateApprovalCompleteness,
  combineValidationResults,
} from "../../../../src/domain/plan-rules/validation";

import type {
  PlanRule,
  RuleVersion,
  ApprovalDecision,
  AuditEvent,
} from "../../../../src/domain/plan-rules/models";

import type { ValidationError, ValidationWarning } from "../../../../src/domain/shared/validation-result";

type Ts = import("../../../../src/domain/shared/types").UtcTimestamp;

const ts = (s: string): Ts => s as Ts;
const uid = (s: string) => s as never;

function makeRule(overrides: Partial<PlanRule> = {}): PlanRule {
  return {
    ruleId: uid("00000000-0000-4000-8000-000000000001"),
    statement: "Test rule statement",
    effectiveDate: "2024-01-01",
    applicability: "participant-group",
    primaryCitation: {
      sourceType: "plan-document",
      locator: "Article 4, Section 2",
      date: "2023-06-15",
    },
    createdAt: ts("2024-01-01T00:00:00.000Z"),
    createdBy: "author-1",
    ruleContentSha256: uid("aaaa"),
    ...overrides,
  };
}

function makeVersion(overrides: Partial<RuleVersion> = {}): RuleVersion {
  return {
    ruleVersionId: uid("00000000-0000-4000-8000-000000000010"),
    ruleId: uid("00000000-0000-4000-8000-000000000001"),
    version: "1.0.0",
    createdAt: ts("2024-01-01T00:00:00.000Z"),
    createdBy: "author-1",
    statement: "Test rule statement",
    versionContentSha256: uid("bbbb"),
    ...overrides,
  };
}

function makeApproval(overrides: Partial<ApprovalDecision> = {}): ApprovalDecision {
  return {
    approvalId: uid("00000000-0000-4000-8000-000000000020"),
    ruleVersionId: uid("00000000-0000-4000-8000-000000000010"),
    approvedBy: "approver-1",
    approvedAt: ts("2024-01-02T00:00:00.000Z"),
    status: "approved",
    rationale: "Synthetic approval for testing.",
    evidence: ["evidence-ref-1"],
    approvalContentSha256: uid("cccc"),
    ...overrides,
  };
}

function makeAuditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    eventId: uid("00000000-0000-4000-8000-000000000030"),
    ruleId: uid("00000000-0000-4000-8000-000000000001"),
    action: "created",
    actor: "author-1",
    timestamp: ts("2024-01-01T00:00:00.000Z"),
    rationale: "Rule created.",
    metadata: {},
    eventContentSha256: uid("dddd"),
    ...overrides,
  };
}

function makeWarning(code: string, message: string): ValidationWarning {
  return { code, severity: "warning", affectedCells: [], message, detail: "Test detail" };
}

function makeError(code: string, message: string): ValidationError {
  return { code, severity: "error", affectedCells: [], affectedNames: [], message, detail: "Test detail", remediation: "Fix it" };
}

const population = {
  effectiveDate: "2024-06-01",
  classifications: ["participant-group"],
} as never;

/* ==================== rule-engine ==================== */

describe("rule-engine", () => {
  it("createPlanRule generates deterministic rule", async () => {
    const input = {
      statement: "Test rule",
      effectiveDate: "2024-01-01",
      applicability: "participant-group",
      primaryCitation: { sourceType: "plan-document" as const, locator: "Art 4", date: "2023-01-01" },
      createdBy: "author-1",
      createdAt: ts("2024-01-01T00:00:00.000Z"),
    };
    const rule1 = await createPlanRule(input);
    const rule2 = await createPlanRule(input);
    expect(rule1.ruleContentSha256).toBe(rule2.ruleContentSha256);
  });

  it("isRuleEffectiveOn checks date ranges", () => {
    const rule = makeRule({ effectiveDate: "2024-01-01", endDate: "2024-12-31" });
    expect(isRuleEffectiveOn(rule, "2024-06-15")).toBe(true);
    expect(isRuleEffectiveOn(rule, "2025-01-01")).toBe(false);
    expect(isRuleEffectiveOn(rule, "2023-12-31")).toBe(false);
  });

  it("isRuleEffectiveOn handles open-ended rules", () => {
    const rule = makeRule({ effectiveDate: "2024-01-01" });
    expect(isRuleEffectiveOn(rule, "2099-12-31")).toBe(true);
  });

  it("matchesApplicability matches exact classification", () => {
    expect(matchesApplicability("participant-group", "participant-group")).toBe(true);
    expect(matchesApplicability("other-group", "participant-group")).toBe(false);
  });

  it("matchesApplicability matches partial classification", () => {
    expect(matchesApplicability("participant-group", "participant-group,amendment-period")).toBe(true);
    expect(matchesApplicability("amendment-period", "participant-group,amendment-period")).toBe(true);
  });

  it("validateSemanticVersion accepts valid versions", () => {
    expect(validateSemanticVersion("1.0.0")).toBe(true);
    expect(validateSemanticVersion("2.3.1")).toBe(true);
    expect(validateSemanticVersion("0.0.1")).toBe(true);
  });

  it("validateSemanticVersion rejects invalid versions", () => {
    expect(validateSemanticVersion("1.0")).toBe(false);
    expect(validateSemanticVersion("v1.0.0")).toBe(false);
    expect(validateSemanticVersion("1.0.0-beta")).toBe(false);
  });

  it("createRuleVersion produces version with correct fields", async () => {
    const rule = makeRule();
    const version = await createRuleVersion({
      ruleId: rule.ruleId,
      version: "1.0.0",
      statement: rule.statement,
      createdBy: "author-1",
      createdAt: ts("2024-01-01T00:00:00.000Z"),
    });
    expect(version.version).toBe("1.0.0");
    expect(version.ruleId).toBe(rule.ruleId);
    expect(version.createdBy).toBe("author-1");
  });

  it("recordAuditEvent creates event with correct action", async () => {
    const rule = makeRule();
    const event = await recordAuditEvent({
      ruleId: rule.ruleId,
      action: "approved",
      actor: "approver-1",
      rationale: "Approved for testing.",
      timestamp: ts("2024-01-01T00:00:00.000Z"),
    });
    expect(event.action).toBe("approved");
    expect(event.actor).toBe("approver-1");
  });
});

/* ==================== rule-versioning ==================== */

describe("rule-versioning", () => {
  it("compareVersions orders versions correctly", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
    expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.9.0", "2.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.9", "1.1.0")).toBeLessThan(0);
  });

  it("getNextPatchVersion increments patch", () => {
    expect(getNextPatchVersion("1.0.0")).toBe("1.0.1");
    expect(getNextPatchVersion("2.3.5")).toBe("2.3.6");
  });

  it("getNextMinorVersion increments minor and resets patch", () => {
    expect(getNextMinorVersion("1.0.0")).toBe("1.1.0");
    expect(getNextMinorVersion("2.3.5")).toBe("2.4.0");
  });

  it("getNextMajorVersion increments major and resets minor/patch", () => {
    expect(getNextMajorVersion("1.0.0")).toBe("2.0.0");
    expect(getNextMajorVersion("2.3.5")).toBe("3.0.0");
  });

  it("validateSupersessionChain accepts valid chain", () => {
    const chain: SupersessionLink[] = [
      createSupersessionLink(uid("aaa"), uid("hash-a"), "2024-01-01", "initial", 1),
      createSupersessionLink(uid("bbb"), uid("hash-b"), "2024-06-01", "supersession", 2),
    ];
    expect(validateSupersessionChain(chain)).toEqual({ valid: true, errors: [] });
  });

  it("validateSupersessionChain rejects non-initial first link", () => {
    const chain: SupersessionLink[] = [
      createSupersessionLink(uid("aaa"), uid("hash-a"), "2024-01-01", "supersession", 1),
    ];
    const result = validateSupersessionChain(chain);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validateSupersessionChain rejects duplicate ordinals", () => {
    const chain: SupersessionLink[] = [
      createSupersessionLink(uid("aaa"), uid("hash-a"), "2024-01-01", "initial", 1),
      createSupersessionLink(uid("bbb"), uid("hash-b"), "2024-06-01", "supersession", 1),
    ];
    const result = validateSupersessionChain(chain);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("computeRuleVersionHash is deterministic", async () => {
    const rule = makeRule();
    const hash1 = await computeRuleVersionHash(rule.ruleId, "1.0.0", rule.statement);
    const hash2 = await computeRuleVersionHash(rule.ruleId, "1.0.0", rule.statement);
    expect(hash1).toBe(hash2);
  });

  it("createSupersessionLink creates link with correct fields", () => {
    const link = createSupersessionLink(uid("aaa"), uid("hash-a"), "2024-01-01", "initial", 1);
    expect(link.ordinal).toBe(1);
    expect(link.predecessorRuleId).toBe("aaa");
    expect(link.effectiveDate).toBe("2024-01-01");
    expect(link.linkType).toBe("initial");
  });
});

/* ==================== rule-approval ==================== */

describe("rule-approval", () => {
  it("validateApprovalAuthority accepts valid approver", () => {
    const result = validateApprovalAuthority("approver-1", "approver-1");
    expect(result.valid).toBe(true);
  });

  it("validateApprovalAuthority rejects invalid approver", () => {
    const result = validateApprovalAuthority("unknown", "approver-1");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("validateApprovalInput accepts valid input", () => {
    const version = makeVersion();
    const result = validateApprovalInput({
      caseApproverId: "approver-1",
      ruleVersion: version,
      approverId: "approver-1",
      approvedAt: ts("2024-01-02T00:00:00.000Z"),
      status: "approved",
      rationale: "Approved for testing.",
      evidence: ["evidence-ref-1"],
    });
    expect(result.valid).toBe(true);
  });

  it("validateApprovalInput rejects missing rationale", () => {
    const version = makeVersion();
    const result = validateApprovalInput({
      caseApproverId: "approver-1",
      ruleVersion: version,
      approverId: "approver-1",
      approvedAt: ts("2024-01-02T00:00:00.000Z"),
      status: "approved",
      rationale: "",
      evidence: ["evidence-ref-1"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validateApprovalInput rejects approval without evidence", () => {
    const version = makeVersion();
    const result = validateApprovalInput({
      caseApproverId: "approver-1",
      ruleVersion: version,
      approverId: "approver-1",
      approvedAt: ts("2024-01-02T00:00:00.000Z"),
      status: "approved",
      rationale: "Approved for testing.",
      evidence: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("getApprovalStatus returns status for rule version", () => {
    const approvals = [makeApproval()];
    const status = getApprovalStatus(approvals, uid("00000000-0000-4000-8000-000000000010"));
    expect(status).toBe("approved");
  });

  it("getApprovalStatus returns null when no approval exists", () => {
    const status = getApprovalStatus([], uid("00000000-0000-4000-8000-000000000010"));
    expect(status).toBeNull();
  });

  it("isRuleApproved returns true when approved", () => {
    const approvals = [makeApproval()];
    expect(isRuleApproved(approvals, uid("00000000-0000-4000-8000-000000000010"))).toBe(true);
  });

  it("isRuleApproved returns false when not approved", () => {
    expect(isRuleApproved([], uid("00000000-0000-4000-8000-000000000010"))).toBe(false);
  });

  it("getLatestApproval returns most recent approval", () => {
    const older = makeApproval({ approvedAt: ts("2024-01-01T00:00:00.000Z") });
    const newer = makeApproval({
      approvalId: uid("00000000-0000-4000-8000-000000000021"),
      approvedAt: ts("2024-06-01T00:00:00.000Z"),
    });
    const latest = getLatestApproval([older, newer], uid("00000000-0000-4000-8000-000000000010"));
    expect(latest?.approvalId).toBe(newer.approvalId);
  });

  it("getLatestApproval returns null when no approvals", () => {
    const latest = getLatestApproval([], uid("00000000-0000-4000-8000-000000000010"));
    expect(latest).toBeNull();
  });

  it("getApprovalHistory returns all approvals sorted", () => {
    const a1 = makeApproval({ approvedAt: ts("2024-01-01T00:00:00.000Z") });
    const a2 = makeApproval({
      approvalId: uid("00000000-0000-4000-8000-000000000021"),
      approvedAt: ts("2024-06-01T00:00:00.000Z"),
    });
    const history = getApprovalHistory([a2, a1], "00000000-0000-4000-8000-000000000010");
    expect(history.length).toBe(2);
    expect(history[0]?.approvedAt).toBe("2024-06-01T00:00:00.000Z");
  });

  it("createApprovalAuditEvent creates event with correct action", () => {
    const version = makeVersion();
    const event = createApprovalAuditEvent(
      version,
      "approver-1",
      ts("2024-01-02T00:00:00.000Z"),
      "approved",
      "Approved for testing.",
    );
    expect(event.action).toBe("approved");
    expect(event.actor).toBe("approver-1");
  });

  it("createApprovalAuditEvent creates rejection event", () => {
    const version = makeVersion();
    const event = createApprovalAuditEvent(
      version,
      "approver-1",
      ts("2024-01-02T00:00:00.000Z"),
      "rejected",
      "Rejected for testing.",
    );
    expect(event.action).toBe("rejected");
  });
});

/* ==================== rule-query ==================== */

describe("rule-query", () => {
  const rules = [
    makeRule({
      ruleId: uid("00000000-0000-4000-8000-000000000001"),
      effectiveDate: "2024-01-01",
      endDate: "2024-12-31",
      applicability: "participant-group",
    }),
    makeRule({
      ruleId: uid("00000000-0000-4000-8000-000000000002"),
      effectiveDate: "2024-06-01",
      applicability: "amendment-period",
    }),
    makeRule({
      ruleId: uid("00000000-0000-4000-8000-000000000003"),
      effectiveDate: "2025-01-01",
      applicability: "participant-group",
    }),
  ];

  it("queryRules filters by effectiveDate", () => {
    const result = queryRules(rules, { effectiveDate: "2024-06-15" });
    expect(result.length).toBe(2);
  });

  it("queryRules filters by applicability", () => {
    const result = queryRules(rules, { applicability: "participant-group" });
    expect(result.length).toBe(2);
  });

  it("findRuleById returns correct rule", () => {
    const found = findRuleById(rules, uid("00000000-0000-4000-8000-000000000002"));
    expect(found?.applicability).toBe("amendment-period");
  });

  it("findRuleById returns null when not found", () => {
    const found = findRuleById(rules, uid("00000000-0000-4000-8000-999999999999"));
    expect(found).toBeNull();
  });

  it("findRulesByApplicability returns matching rules", () => {
    const result = findRulesByApplicability(rules, "participant-group");
    expect(result.length).toBe(2);
  });

  it("getRulesEffectiveOn returns rules effective on date", () => {
    const result = getRulesEffectiveOn(rules, "2024-06-15");
    expect(result.length).toBe(2);
  });

  it("getRulesApplicableTo returns rules matching classification", () => {
    const result = getRulesApplicableTo(rules, "participant-group");
    expect(result.length).toBe(2);
  });

  it("getApplicableRulesForWorkbook returns correct context", () => {
    const context = getApplicableRulesForWorkbook(rules, "2024-06-15", "participant-group");
    expect(context.effectiveDate).toBe("2024-06-15");
    expect(context.applicableRuleIds.length).toBe(1);
  });

  it("matchRulesToClassification returns matches with scores", () => {
    const matches = matchRulesToClassification(rules, "participant-group");
    expect(matches.length).toBe(2);
    expect(matches[0]?.matchScore).toBeGreaterThanOrEqual(matches[1]?.matchScore ?? 0);
  });

  it("getRuleVersion returns specific version", () => {
    const versions = [
      makeVersion({ version: "1.0.0" }),
      makeVersion({ version: "2.0.0", ruleVersionId: uid("00000000-0000-4000-8000-000000000011") }),
    ];
    const found = getRuleVersion(versions, uid("00000000-0000-4000-8000-000000000001"), "2.0.0");
    expect(found?.version).toBe("2.0.0");
  });

  it("getRuleVersion returns latest version when no version specified", () => {
    const versions = [
      makeVersion({ version: "1.0.0" }),
      makeVersion({ version: "2.0.0", ruleVersionId: uid("00000000-0000-4000-8000-000000000011") }),
    ];
    const latest = getRuleVersion(versions, uid("00000000-0000-4000-8000-000000000001"));
    expect(latest?.version).toBe("2.0.0");
  });

  it("getRuleVersionHistory returns versions sorted", () => {
    const v1 = makeVersion({ version: "1.0.0" });
    const v2 = makeVersion({ version: "2.0.0", ruleVersionId: uid("00000000-0000-4000-8000-000000000011") });
    const history = getRuleVersionHistory([v1, v2], uid("00000000-0000-4000-8000-000000000001"));
    expect(history[0]?.version).toBe("2.0.0");
    expect(history[1]?.version).toBe("1.0.0");
  });

  it("getAuditEventsForRule returns events for specific rule", () => {
    const events = [
      makeAuditEvent({ ruleId: uid("00000000-0000-4000-8000-000000000001") }),
      makeAuditEvent({ ruleId: uid("00000000-0000-4000-8000-000000000002"), eventId: uid("00000000-0000-4000-8000-000000000031") }),
    ];
    const result = getAuditEventsForRuleFromQuery(events, uid("00000000-0000-4000-8000-000000000001"));
    expect(result.length).toBe(1);
  });
});

/* ==================== audit-log ==================== */

describe("audit-log", () => {
  it("createAuditEvent creates event with correct fields", async () => {
    const event = await createAuditEvent({
      ruleId: uid("00000000-0000-4000-8000-000000000001"),
      action: "created",
      actor: "author-1",
      rationale: "Rule created.",
      metadata: { source: "test" },
      timestamp: ts("2024-01-01T00:00:00.000Z"),
    });
    expect(event.action).toBe("created");
    expect(event.actor).toBe("author-1");
    expect(event.metadata).toEqual({ source: "test" });
  });

  it("appendAuditEvent adds event to log", () => {
    const log = createAuditLog();
    const event = makeAuditEvent();
    const updated = appendAuditEvent(log, event);
    expect(updated.events.length).toBe(1);
    expect(updated.events[0]?.eventId).toBe(event.eventId);
  });

  it("createAuditLog creates empty log", () => {
    const log = createAuditLog();
    expect(log.events.length).toBe(0);
  });

  it("createAuditLog creates log with initial events", () => {
    const event = makeAuditEvent();
    const log = createAuditLog([event]);
    expect(log.events.length).toBe(1);
  });

  it("getAuditEventsByActor filters by actor", () => {
    const events = [
      makeAuditEvent({ actor: "author-1" }),
      makeAuditEvent({ actor: "approver-1", eventId: uid("00000000-0000-4000-8000-000000000031") }),
    ];
    const log = createAuditLog(events);
    const result = getAuditEventsByActor(log, "author-1");
    expect(result.length).toBe(1);
    expect(result[0]?.actor).toBe("author-1");
  });

  it("getAuditEventsByAction filters by action", () => {
    const events = [
      makeAuditEvent({ action: "created" }),
      makeAuditEvent({ action: "approved", eventId: uid("00000000-0000-4000-8000-000000000031") }),
    ];
    const log = createAuditLog(events);
    const result = getAuditEventsByAction(log, "created");
    expect(result.length).toBe(1);
    expect(result[0]?.action).toBe("created");
  });

  it("getAuditEventsInRange filters by timestamp", () => {
    const events = [
      makeAuditEvent({ timestamp: ts("2024-01-01T00:00:00.000Z") }),
      makeAuditEvent({ timestamp: ts("2024-06-01T00:00:00.000Z"), eventId: uid("00000000-0000-4000-8000-000000000031") }),
      makeAuditEvent({ timestamp: ts("2025-01-01T00:00:00.000Z"), eventId: uid("00000000-0000-4000-8000-000000000032") }),
    ];
    const log = createAuditLog(events);
    const result = getAuditEventsInRange(log, ts("2024-01-01T00:00:00.000Z"), ts("2024-12-31T23:59:59.999Z"));
    expect(result.length).toBe(2);
  });

  it("getAuditEventById returns correct event", () => {
    const event = makeAuditEvent({ eventId: uid("00000000-0000-4000-8000-000000000030") });
    const log = createAuditLog([event]);
    const found = getAuditEventById(log, "00000000-0000-4000-8000-000000000030");
    expect(found?.eventId).toBe("00000000-0000-4000-8000-000000000030");
  });

  it("getAuditEventById returns null when not found", () => {
    const log = createAuditLog();
    const found = getAuditEventById(log, "00000000-0000-4000-8000-999999999999");
    expect(found).toBeNull();
  });

  it("verifyAuditLogIntegrity returns valid for consistent log", () => {
    const event = makeAuditEvent({ eventId: uid("00000000-0000-4000-8000-000000000030") });
    const log = createAuditLog([event]);
    const result = verifyAuditLogIntegrity(log);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("verifyAuditLogIntegrity detects invalid eventId", () => {
    const event = makeAuditEvent({ eventId: uid("invalid") });
    const log = createAuditLog([event]);
    const result = verifyAuditLogIntegrity(log);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("getAuditSummary returns correct counts", () => {
    const events = [
      makeAuditEvent({ action: "created", actor: "author-1" }),
      makeAuditEvent({ action: "approved", actor: "approver-1", eventId: uid("00000000-0000-4000-8000-000000000031") }),
      makeAuditEvent({ action: "created", actor: "author-2", eventId: uid("00000000-0000-4000-8000-000000000032") }),
    ];
    const log = createAuditLog(events);
    const summary = getAuditSummary(log);
    expect(summary.totalEvents).toBe(3);
    expect(summary.byAction.created).toBe(2);
    expect(summary.byAction.approved).toBe(1);
  });
});

/* ==================== validation ==================== */

describe("validation", () => {
  it("validateRuleSet returns warnings for no effective rules", () => {
    const result = validateRuleSet({
      rules: [],
      ruleVersions: [],
      population,
      caseApproverId: "approver-1",
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === "NO_EFFECTIVE_RULES")).toBe(true);
  });

  it("validateRuleSet returns warnings for overlapping applicability", () => {
    const rules = [
      makeRule({ ruleId: uid("00000000-0000-4000-8000-000000000001"), applicability: "participant-group" }),
      makeRule({ ruleId: uid("00000000-0000-4000-8000-000000000002"), applicability: "participant-group" }),
    ];
    const result = validateRuleSet({
      rules,
      ruleVersions: [],
      population,
      caseApproverId: "approver-1",
    });
    expect(result.warnings.some((w) => w.code === "OVERLAPPING_APPLICABILITY")).toBe(true);
  });

  it("validatePopulationApplicability returns errors when no effective rules", () => {
    const result = validatePopulationApplicability(population, []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "NO_EFFECTIVE_RULES_FOR_POPULATION")).toBe(true);
  });

  it("validateRuleVersions detects duplicate versions", () => {
    const v1 = makeVersion({ version: "1.0.0" });
    const v2 = makeVersion({ version: "1.0.0", ruleVersionId: uid("00000000-0000-4000-8000-000000000011") });
    const result = validateRuleVersions([v1, v2], [makeRule()]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DUPLICATE_RULE_VERSION")).toBe(true);
  });

  it("validateRuleVersions warns for rule without version", () => {
    const rule = makeRule();
    const result = validateRuleVersions([], [rule]);
    expect(result.warnings.some((w) => w.code === "RULE_WITHOUT_VERSION")).toBe(true);
  });

  it("validateApprovalCompleteness warns for unapproved versions", () => {
    const version = makeVersion();
    const result = validateApprovalCompleteness([], [makeRule()], [version]);
    expect(result.warnings.some((w) => w.code === "UNAPPROVED_RULE_VERSION")).toBe(true);
  });

  it("validateApprovalCompleteness passes when all versions approved", () => {
    const version = makeVersion();
    const approval = makeApproval({ ruleVersionId: version.ruleVersionId });
    const result = validateApprovalCompleteness([approval], [makeRule()], [version]);
    expect(result.warnings.some((w) => w.code === "UNAPPROVED_RULE_VERSION")).toBe(false);
  });

  it("combineValidationResults merges results", () => {
    const r1 = {
      valid: true,
      errors: [] as ValidationError[],
      warnings: [makeWarning("W1", "Warning 1")],
    };
    const r2 = {
      valid: false,
      errors: [makeError("E1", "Error 1")],
      warnings: [] as ValidationWarning[],
    };
    const combined = combineValidationResults(r1, r2);
    expect(combined.valid).toBe(false);
    expect(combined.errors.length).toBe(1);
    expect(combined.warnings.length).toBe(1);
  });

  it("combineValidationResults deduplicates results", () => {
    const r1 = {
      valid: true,
      errors: [] as ValidationError[],
      warnings: [makeWarning("W1", "Warning 1")],
    };
    const r2 = {
      valid: true,
      errors: [] as ValidationError[],
      warnings: [makeWarning("W1", "Warning 1")],
    };
    const combined = combineValidationResults(r1, r2);
    expect(combined.warnings.length).toBe(1);
  });
});

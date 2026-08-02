import { hashTyped } from "../manifests/canonical-json";
import { deterministicUuid } from "../build-spec/identity";
import { parseUuid } from "../shared/types";
import type { Uuid, Sha256, UtcTimestamp } from "../shared/types";
import type {
  PlanRule,
  RuleVersion,
  ApprovalDecision,
  AuditEvent,
  Citation,
} from "./models";

export async function createPlanRule(input: {
  readonly statement: string;
  readonly effectiveDate: string;
  readonly endDate?: string;
  readonly applicability: string;
  readonly primaryCitation: Citation;
  readonly createdAt: UtcTimestamp;
  readonly createdBy: string;
}): Promise<PlanRule> {
  const ruleIdString = await deterministicUuid("PlanRule", {
    statement: input.statement,
    effectiveDate: input.effectiveDate,
    applicability: input.applicability,
  });
  const ruleIdResult = parseUuid(ruleIdString);
  if (!ruleIdResult.ok)
    throw new Error(`Failed to parse UUID: ${ruleIdResult.error.message}`);
  const ruleId = ruleIdResult.value;

  const deterministicPayload = {
    statement: input.statement,
    effectiveDate: input.effectiveDate,
    endDate: input.endDate ?? null,
    applicability: input.applicability,
    primaryCitation: input.primaryCitation,
  } as const;

  const ruleContentSha256 = (await hashTyped(deterministicPayload, {
    typeName: "PlanRuleContent",
  })) as Sha256;

  return {
    ruleId,
    statement: input.statement,
    effectiveDate: input.effectiveDate,
    endDate: input.endDate,
    applicability: input.applicability,
    primaryCitation: input.primaryCitation,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    ruleContentSha256,
  };
}

export async function createRuleVersion(input: {
  readonly ruleId: Uuid;
  readonly version: string;
  readonly statement: string;
  readonly createdAt: UtcTimestamp;
  readonly createdBy: string;
  readonly supersedes?: Sha256;
}): Promise<RuleVersion> {
  const deterministicPayload = {
    ruleId: input.ruleId,
    version: input.version,
    statement: input.statement,
    supersedes: input.supersedes ?? null,
  } as const;

  const versionContentSha256 = (await hashTyped(deterministicPayload, {
    typeName: "RuleVersionContent",
  })) as Sha256;

  return {
    ruleVersionId: versionContentSha256,
    ruleId: input.ruleId,
    version: input.version,
    statement: input.statement,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    supersedes: input.supersedes,
    versionContentSha256,
  };
}

export async function recordApprovalDecision(input: {
  readonly ruleVersionId: Sha256;
  readonly approvedBy: string;
  readonly approvedAt: UtcTimestamp;
  readonly status: "approved" | "rejected" | "pending-review";
  readonly rationale: string;
  readonly evidence: readonly string[];
}): Promise<ApprovalDecision> {
  const deterministicPayload = {
    ruleVersionId: input.ruleVersionId,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
    status: input.status,
    rationale: input.rationale,
    evidence: [...input.evidence].sort(),
  } as const;

  const approvalContentSha256 = (await hashTyped(deterministicPayload, {
    typeName: "ApprovalDecisionContent",
  })) as Sha256;

  return {
    approvalId: approvalContentSha256,
    ruleVersionId: input.ruleVersionId,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
    status: input.status,
    rationale: input.rationale,
    evidence: input.evidence,
    approvalContentSha256,
  };
}

export async function recordAuditEvent(input: {
  readonly ruleId: Uuid;
  readonly action:
    "created" | "approved" | "rejected" | "superseded" | "effective-dated";
  readonly actor: string;
  readonly timestamp: UtcTimestamp;
  readonly rationale: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): Promise<AuditEvent> {
  const eventIdString = await deterministicUuid("AuditEvent", {
    ruleId: input.ruleId,
    action: input.action,
    timestamp: input.timestamp,
    actor: input.actor,
  });
  const eventIdResult = parseUuid(eventIdString);
  if (!eventIdResult.ok)
    throw new Error(`Failed to parse UUID: ${eventIdResult.error.message}`);
  const eventId = eventIdResult.value;

  const deterministicPayload = {
    ruleId: input.ruleId,
    action: input.action,
    actor: input.actor,
    timestamp: input.timestamp,
    rationale: input.rationale,
    metadata: input.metadata ?? {},
  } as const;

  const eventContentSha256 = (await hashTyped(deterministicPayload, {
    typeName: "AuditEventContent",
  })) as Sha256;

  return {
    eventId,
    ruleId: input.ruleId,
    action: input.action,
    actor: input.actor,
    timestamp: input.timestamp,
    rationale: input.rationale,
    metadata: input.metadata ?? {},
    eventContentSha256,
  };
}

export function validateSemanticVersion(version: string): boolean {
  const semverPattern = /^\d+\.\d+\.\d+$/;
  return semverPattern.test(version);
}

export function isRuleEffectiveOn(rule: PlanRule, date: string): boolean {
  return rule.effectiveDate <= date && (!rule.endDate || rule.endDate > date);
}

export function matchesApplicability(
  classification: string,
  applicability: string,
): boolean {
  const classificationLower = classification.toLowerCase();
  const applicabilityLower = applicability.toLowerCase();
  return (
    applicabilityLower.includes(classificationLower) ||
    classificationLower.includes(applicabilityLower)
  );
}

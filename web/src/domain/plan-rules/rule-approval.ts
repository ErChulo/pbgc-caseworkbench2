import { hashTyped } from "../manifests/canonical-json";
import type { Sha256, UtcTimestamp } from "../shared/types";
import type {
  ApprovalDecision,
  ApprovalStatus,
  AuditEvent,
  RuleVersion,
} from "./models";

export interface ApprovalContext {
  readonly caseApproverId: string;
  readonly ruleVersion: RuleVersion;
  readonly approverId: string;
  readonly approvedAt: UtcTimestamp;
  readonly status: ApprovalStatus;
  readonly rationale: string;
  readonly evidence: readonly string[];
}

export function validateApprovalAuthority(
  approverId: string,
  caseApproverId: string,
): { valid: boolean; error?: string } {
  if (approverId !== caseApproverId) {
    return {
      valid: false,
      error: "Only the designated case approver may approve rules",
    };
  }
  return { valid: true };
}

export function validateApprovalInput(
  input: ApprovalContext,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const authorityCheck = validateApprovalAuthority(input.approverId, input.caseApproverId);
  if (!authorityCheck.valid && authorityCheck.error) {
    errors.push(authorityCheck.error);
  }

  if (!input.rationale || input.rationale.trim() === "") {
    errors.push("Approval rationale is required");
  }

  if (input.status === "approved" && input.evidence.length === 0) {
    errors.push("At least one piece of evidence is required for approval");
  }

  if (input.status === "rejected" && (!input.rationale || input.rationale.trim() === "")) {
    errors.push("Rejection rationale is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function recordApprovalDecision(input: ApprovalContext): Promise<ApprovalDecision> {
  const deterministicPayload = {
    ruleVersionId: input.ruleVersion.ruleVersionId,
    approvedBy: input.approverId,
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
    ruleVersionId: input.ruleVersion.ruleVersionId,
    approvedBy: input.approverId,
    approvedAt: input.approvedAt,
    status: input.status,
    rationale: input.rationale,
    evidence: input.evidence,
    approvalContentSha256,
  };
}

export function createApprovalAuditEvent(
  ruleVersion: RuleVersion,
  approverId: string,
  approvedAt: UtcTimestamp,
  status: ApprovalStatus,
  rationale: string,
): Omit<AuditEvent, "eventId" | "eventContentSha256"> {
  return {
    ruleId: ruleVersion.ruleId,
    action: status === "approved" ? "approved" : "rejected",
    actor: approverId,
    timestamp: approvedAt,
    rationale,
    metadata: {
      ruleVersionId: ruleVersion.ruleVersionId,
      version: ruleVersion.version,
    },
  };
}

export function getApprovalStatus(
  approvals: readonly ApprovalDecision[],
  ruleVersionId: Sha256,
): ApprovalStatus | null {
  const approval = approvals.find((a) => a.ruleVersionId === ruleVersionId);
  return approval?.status ?? null;
}

export function isRuleApproved(
  approvals: readonly ApprovalDecision[],
  ruleVersionId: Sha256,
): boolean {
  const status = getApprovalStatus(approvals, ruleVersionId);
  return status === "approved";
}

export function getLatestApproval(
  approvals: readonly ApprovalDecision[],
  ruleVersionId: Sha256,
): ApprovalDecision | null {
  const relevant = approvals.filter((a) => a.ruleVersionId === ruleVersionId);
  if (relevant.length === 0) return null;

  return relevant.reduce((latest, current) =>
    current.approvedAt > latest.approvedAt ? current : latest,
  );
}

export function getApprovalHistory(
  approvals: readonly ApprovalDecision[],
  ruleId: string,
): readonly ApprovalDecision[] {
  return approvals
    .filter((a) => a.ruleVersionId.startsWith(ruleId))
    .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
}
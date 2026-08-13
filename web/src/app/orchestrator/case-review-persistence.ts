import type { QuarantineQueueItem } from "../../components/quarantine/QuarantineQueue";
import type { ArtifactEligibilityReviewItem } from "../../components/review/ArtifactEligibilityReview";
import type {
  ClassificationReviewItem,
  DateCandidateReviewItem,
} from "../../components/review/ClassificationReview";
import type { PopulationReviewItem } from "../../components/review/PopulationReview";
import type { RelationshipReviewItem } from "../../components/review/RelationshipReview";
import type {
  ClassificationApproval,
  DateSelectionDecision,
  RelationshipDecision,
} from "../../domain/classification/models";
import { hashTyped } from "../../domain/manifests/canonical-json";
import type { PopulationCandidateDecision } from "../../domain/population/population-profile";
import type { ArchitecturePolicyApproval } from "../../domain/architecture/architecture-policy-approval";
import type { AuthenticatedCaseControls } from "../../domain/architecture/scenario-selector";
import type {
  ArtifactEligibilityDecision,
  QuarantineDecision,
} from "../../domain/quarantine/models";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Result,
  type Sha256,
  type UtcTimestamp,
  type Uuid,
} from "../../domain/shared/types";

export interface CaseReviewState {
  readonly quarantineItems: readonly QuarantineQueueItem[];
  readonly eligibilityItems: readonly ArtifactEligibilityReviewItem[];
  readonly classificationItems: readonly ClassificationReviewItem[];
  readonly dateCandidateItems: readonly DateCandidateReviewItem[];
  readonly relationshipItems: readonly RelationshipReviewItem[];
  readonly populationItems: readonly PopulationReviewItem[];
  readonly quarantineDecisions: readonly QuarantineDecision[];
  readonly eligibilityDecisions: readonly ArtifactEligibilityDecision[];
  readonly classificationDecisions: readonly ClassificationApproval[];
  readonly dateSelections: readonly DateSelectionDecision[];
  readonly relationshipDecisions: readonly RelationshipDecision[];
  readonly populationDecisions: readonly PopulationCandidateDecision[];
  readonly architecturePolicyApprovals: readonly ArchitecturePolicyApproval[];
  readonly authenticatedCaseControls: AuthenticatedCaseControls | null;
}

export interface PersistedCaseReviewSnapshot extends CaseReviewState {
  readonly schemaVersion: "1.0.0";
  readonly caseId: Uuid;
  readonly evidenceSnapshotId: Sha256;
  readonly reviewSnapshotId: Sha256;
}

export interface CaseReviewPointer {
  readonly reviewSnapshotId: Sha256;
  readonly writtenAt: UtcTimestamp | null;
}

interface CaseReviewPersistenceError {
  readonly code: "INVALID_CASE_REVIEW_STATE";
  readonly message: string;
}

type CaseReviewSnapshotPayload = Omit<
  PersistedCaseReviewSnapshot,
  "reviewSnapshotId"
>;

export function createEmptyCaseReviewState(): CaseReviewState {
  return {
    quarantineItems: [],
    eligibilityItems: [],
    classificationItems: [],
    dateCandidateItems: [],
    relationshipItems: [],
    populationItems: [],
    quarantineDecisions: [],
    eligibilityDecisions: [],
    classificationDecisions: [],
    dateSelections: [],
    relationshipDecisions: [],
    populationDecisions: [],
    architecturePolicyApprovals: [],
    authenticatedCaseControls: null,
  };
}

export async function createCaseReviewSnapshot(
  payload: CaseReviewSnapshotPayload,
): Promise<PersistedCaseReviewSnapshot> {
  const reviewSnapshotId = asSha256(
    await hashTyped(payload, { typeName: "CaseReviewSnapshot" }),
  );
  return Object.freeze({ ...payload, reviewSnapshotId });
}

export async function parseCaseReviewSnapshot(
  value: unknown,
): Promise<Result<PersistedCaseReviewSnapshot, CaseReviewPersistenceError>> {
  if (!isRecord(value) || value.schemaVersion !== "1.0.0") {
    return invalid("Case review snapshot is not a supported JSON record.");
  }
  if (
    typeof value.caseId !== "string" ||
    typeof value.evidenceSnapshotId !== "string" ||
    typeof value.reviewSnapshotId !== "string"
  ) {
    return invalid("Case review snapshot identity is missing.");
  }
  const caseId = parseUuid(value.caseId);
  const evidenceSnapshotId = parseSha256(value.evidenceSnapshotId);
  const reviewSnapshotId = parseSha256(value.reviewSnapshotId);
  if (!caseId.ok || !evidenceSnapshotId.ok || !reviewSnapshotId.ok) {
    return invalid("Case review snapshot identity is invalid.");
  }
  if (!hasReviewArrays(value)) {
    return invalid("Case review snapshot collections are invalid.");
  }
  const snapshot = {
    ...(value as unknown as PersistedCaseReviewSnapshot),
    architecturePolicyApprovals: Array.isArray(
      value.architecturePolicyApprovals,
    )
      ? (value.architecturePolicyApprovals as readonly ArchitecturePolicyApproval[])
      : [],
    authenticatedCaseControls:
      (value.authenticatedCaseControls as unknown as AuthenticatedCaseControls | null) ??
      null,
  } as PersistedCaseReviewSnapshot;
  const { reviewSnapshotId: ignored, ...payload } = snapshot;
  void ignored;
  let recomputed: Sha256;
  try {
    recomputed = asSha256(
      await hashTyped(payload, { typeName: "CaseReviewSnapshot" }),
    );
  } catch {
    return invalid("Case review snapshot identity could not be recomputed.");
  }
  if (recomputed !== reviewSnapshotId.value) {
    return invalid("Case review snapshot content does not match its identity.");
  }
  return { ok: true, value: snapshot };
}

export function parseCaseReviewPointer(
  value: unknown,
): Result<CaseReviewPointer, CaseReviewPersistenceError> {
  if (!isRecord(value) || typeof value.reviewSnapshotId !== "string") {
    return invalid("Case review pointer is invalid.");
  }
  const reviewSnapshotId = parseSha256(value.reviewSnapshotId);
  if (!reviewSnapshotId.ok)
    return invalid("Case review pointer hash is invalid.");
  let writtenAt: UtcTimestamp | null = null;
  if (value.writtenAt !== null && value.writtenAt !== undefined) {
    if (typeof value.writtenAt !== "string") {
      return invalid("Case review pointer timestamp is invalid.");
    }
    const parsed = parseUtcTimestamp(value.writtenAt);
    if (!parsed.ok) return invalid("Case review pointer timestamp is invalid.");
    writtenAt = parsed.value;
  }
  return {
    ok: true,
    value: { reviewSnapshotId: reviewSnapshotId.value, writtenAt },
  };
}

function hasReviewArrays(
  value: Record<string, unknown>,
): value is Record<keyof CaseReviewState, readonly Record<string, unknown>[]> {
  const requiredKeys: readonly Exclude<
    keyof CaseReviewState,
    "architecturePolicyApprovals" | "authenticatedCaseControls"
  >[] = [
    "quarantineItems",
    "eligibilityItems",
    "classificationItems",
    "dateCandidateItems",
    "relationshipItems",
    "populationItems",
    "quarantineDecisions",
    "eligibilityDecisions",
    "classificationDecisions",
    "dateSelections",
    "relationshipDecisions",
    "populationDecisions",
  ];
  const requiredValid = requiredKeys.every(
    (key) =>
      Array.isArray(value[key]) &&
      (value[key] as readonly unknown[]).every((item) => isRecord(item)),
  );
  if (!requiredValid) return false;
  const approvalsValid =
    value.architecturePolicyApprovals === undefined ||
    (Array.isArray(value.architecturePolicyApprovals) &&
      value.architecturePolicyApprovals.every((item) => isRecord(item)));
  const controlsValid =
    value.authenticatedCaseControls === undefined ||
    value.authenticatedCaseControls === null ||
    isRecord(value.authenticatedCaseControls);
  return approvalsValid && controlsValid;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asSha256(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new Error("Case review snapshot SHA-256 is invalid.");
  return parsed.value;
}

function invalid(message: string): Result<never, CaseReviewPersistenceError> {
  return {
    ok: false,
    error: { code: "INVALID_CASE_REVIEW_STATE", message },
  };
}

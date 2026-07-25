import type { ClockPort, UuidPort } from "../ports";
import type { Result, UtcTimestamp, Uuid } from "../shared/types";

export const CASE_PURPOSES = [
  "production",
  "test",
  "training",
  "duplicate-investigation",
] as const;

export type CasePurpose = (typeof CASE_PURPOSES)[number];
export type NonProductionCasePurpose = Exclude<CasePurpose, "production">;
export type CaseStatus = "active" | "closed" | "archived" | "blocked";

export interface HumanActor {
  readonly actorType: "human";
  readonly actorKey: string;
  readonly displayName: string;
  readonly authorityContext: string;
}

export interface CaseStatusEvent {
  readonly status: CaseStatus;
  readonly occurredAt: UtcTimestamp;
  readonly actor: HumanActor;
  readonly rationale: string;
}

export interface CaseRecord {
  readonly caseId: Uuid;
  readonly authoritativeCaseId: string | null;
  readonly purpose: CasePurpose;
  readonly designationRationale: string | null;
  readonly createdBy: HumanActor;
  readonly createdAt: UtcTimestamp;
  readonly collisionDecisionId: Uuid | null;
  readonly status: CaseStatus;
  readonly statusHistory: readonly CaseStatusEvent[];
}

export interface CaseIndexEntry {
  readonly caseId: Uuid;
  readonly authoritativeCaseId: string | null;
  readonly purpose: CasePurpose;
  readonly casePath: string;
  readonly status: CaseStatus;
}

export interface WorkspaceCatalog {
  readonly schemaVersion: "1.0.0";
  readonly workspaceId: Uuid;
  readonly createdAt: UtcTimestamp;
  readonly cases: readonly CaseIndexEntry[];
}

export interface CaseCreationInput {
  readonly authoritativeCaseId: string | null;
  readonly purpose: CasePurpose;
  readonly designationRationale: string | null;
  readonly createdBy: HumanActor;
  readonly collisionDecisionId?: Uuid | null;
}

export interface CaseCreationDependencies {
  readonly uuid: UuidPort;
  readonly clock: ClockPort;
}

export interface CaseCreationError {
  readonly code:
    | "PRODUCTION_CASE_IDENTIFIER_REQUIRED"
    | "NON_PRODUCTION_RATIONALE_REQUIRED"
    | "INVALID_HUMAN_ACTOR"
    | "INVALID_CASE_PURPOSE";
  readonly safeMessage: string;
  readonly blocksDownstream: true;
}

export function createCase(
  input: CaseCreationInput,
  dependencies: CaseCreationDependencies,
): Result<CaseRecord, CaseCreationError> {
  if (!isCasePurpose(input.purpose)) {
    return failure(
      "INVALID_CASE_PURPOSE",
      "Case purpose must be production, test, training, or duplicate investigation.",
    );
  }
  if (
    !nonblank(input.createdBy.actorKey) ||
    !nonblank(input.createdBy.displayName) ||
    !nonblank(input.createdBy.authorityContext)
  ) {
    return failure(
      "INVALID_HUMAN_ACTOR",
      "Case creation requires a complete asserted human identity.",
    );
  }
  if (input.purpose === "production" && !nonblank(input.authoritativeCaseId)) {
    return failure(
      "PRODUCTION_CASE_IDENTIFIER_REQUIRED",
      "A production case requires an authoritative PBGC case identifier.",
    );
  }
  if (input.purpose !== "production" && !nonblank(input.designationRationale)) {
    return failure(
      "NON_PRODUCTION_RATIONALE_REQUIRED",
      "A non-production case requires an explicit designation rationale.",
    );
  }

  const record: CaseRecord = {
    caseId: dependencies.uuid.generate(),
    authoritativeCaseId: input.authoritativeCaseId,
    purpose: input.purpose,
    designationRationale:
      input.purpose === "production" ? null : input.designationRationale,
    createdBy: Object.freeze({ ...input.createdBy }),
    createdAt: dependencies.clock.now(),
    collisionDecisionId: input.collisionDecisionId ?? null,
    status: "active",
    statusHistory: Object.freeze([]),
  };
  return { ok: true, value: Object.freeze(record) };
}

export function caseIndexEntry(caseRecord: CaseRecord): CaseIndexEntry {
  return Object.freeze({
    caseId: caseRecord.caseId,
    authoritativeCaseId: caseRecord.authoritativeCaseId,
    purpose: caseRecord.purpose,
    casePath: `cases/${caseRecord.caseId}/case.json`,
    status: caseRecord.status,
  });
}

function isCasePurpose(value: unknown): value is CasePurpose {
  return CASE_PURPOSES.some((purpose) => purpose === value);
}

function nonblank(value: string | null): value is string {
  return value !== null && value.length > 0 && value === value.trim();
}

function failure(
  code: CaseCreationError["code"],
  safeMessage: string,
): Result<never, CaseCreationError> {
  return {
    ok: false,
    error: { code, safeMessage, blocksDownstream: true },
  };
}

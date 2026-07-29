import type { Sha256, UtcTimestamp, Uuid } from "../shared/types";

export interface SnapshotEntry {
  readonly observedRelativePath: string;
  readonly normalizedDisplayPath: string;
  readonly sha256: Sha256;
  readonly sizeBytes: number;
  readonly declaredMediaType: string | null;
  readonly lastModifiedObserved: UtcTimestamp | null;
}

export interface PackageSnapshot {
  readonly snapshotId: Sha256;
  readonly snapshotRecordId: Uuid;
  readonly entries: readonly SnapshotEntry[];
  readonly discoveredCount: number;
  readonly totalBytes: number;
  readonly frozenAt: UtcTimestamp;
}

export interface IntakeAttempt {
  readonly attemptId: Uuid;
  readonly caseId: Uuid;
  readonly priorAttemptId: Uuid | null;
  readonly divergenceReason: string | null;
  readonly initiatedBy: string;
  readonly startedAt: UtcTimestamp;
  readonly endedAt: UtcTimestamp | null;
  readonly sourceContext: Readonly<Record<string, string>>;
  readonly snapshotId: Sha256;
  readonly snapshotRecordId: Uuid;
  readonly status:
    | "discovering"
    | "hashing"
    | "preserving"
    | "processing"
    | "partial"
    | "blocked"
    | "completed"
    | "failed"
    | "interrupted"
    | "cancelled";
  readonly statusHistory: readonly string[];
  readonly ruleSetVersion: string;
}

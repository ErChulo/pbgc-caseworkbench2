import type { Sha256, Uuid } from "../shared/types";
import type { ArtifactRecord, ReceiptRecord } from "../artifacts/models";
import type { PackageSnapshot, SnapshotEntry } from "../attempts/models";
import type {
  Reconciliation,
  ReconciliationEntry,
  OriginCategory,
  TerminalCategory,
} from "../manifests/reconciliation";
import { reconcileInventory } from "../manifests/reconciliation";

export interface GovernedArtifactState {
  readonly artifacts: readonly ArtifactRecord[];
  readonly receipts: readonly ReceiptRecord[];
  readonly snapshot: PackageSnapshot | null;
  readonly reconciliation: Reconciliation | null;
}

export interface ArtifactRegistrationInput {
  readonly artifact: ArtifactRecord;
  readonly receipt: ReceiptRecord;
  readonly snapshotEntry: SnapshotEntry;
}

export interface ArtifactStatusUpdate {
  readonly artifactId: Uuid;
  readonly processingStatus: ArtifactRecord["processingStatus"];
  readonly downstreamEligibility: ArtifactRecord["downstreamEligibility"];
}

export interface RegistryProjection {
  readonly artifactCount: number;
  readonly preservedCount: number;
  readonly blockedCount: number;
  readonly duplicateCount: number;
  readonly failedCount: number;
  readonly pendingReviewCount: number;
  readonly snapshotId: string | null;
  readonly reconciliation: Reconciliation | null;
  readonly artifactsByStatus: Readonly<
    Record<ArtifactRecord["processingStatus"], readonly ArtifactRecord[]>
  >;
}

export class GovernedRegistry {
  private artifacts: ArtifactRecord[] = [];
  private receipts: ReceiptRecord[] = [];
  private snapshot: PackageSnapshot | null = null;
  private reconciliation: Reconciliation | null = null;

  register(input: ArtifactRegistrationInput): void {
    this.artifacts = [...this.artifacts, input.artifact];
    this.receipts = [...this.receipts, input.receipt];
  }

  registerBatch(inputs: readonly ArtifactRegistrationInput[]): void {
    for (const input of inputs) {
      this.register(input);
    }
  }

  updateArtifactStatus(update: ArtifactStatusUpdate): void {
    this.artifacts = this.artifacts.map((artifact) =>
      artifact.artifactId === update.artifactId
        ? {
            ...artifact,
            processingStatus: update.processingStatus,
            downstreamEligibility: update.downstreamEligibility,
          }
        : artifact,
    );
  }

  setSnapshot(snapshot: PackageSnapshot): void {
    this.snapshot = snapshot;
  }

  computeReconciliation(): Reconciliation {
    const artifactIds = this.artifacts.map((a) => a.artifactId);
    const originLedger: ReconciliationEntry<OriginCategory>[] =
      this.artifacts.map((a) => ({
        recordId: a.artifactId,
        category: "source-artifact" as const,
      }));
    const terminalLedger: ReconciliationEntry<TerminalCategory>[] =
      this.artifacts.map((a) => ({
        recordId: a.artifactId,
        category: this.terminalCategoryFor(a.processingStatus),
      }));
    this.reconciliation = reconcileInventory(
      artifactIds,
      originLedger,
      terminalLedger,
    );
    return this.reconciliation;
  }

  getState(): GovernedArtifactState {
    return {
      artifacts: Object.freeze([...this.artifacts]),
      receipts: Object.freeze([...this.receipts]),
      snapshot: this.snapshot,
      reconciliation: this.reconciliation,
    };
  }

  project(): RegistryProjection {
    const byStatus: Record<string, ArtifactRecord[]> = {};
    for (const artifact of this.artifacts) {
      const list = byStatus[artifact.processingStatus] ?? [];
      list.push(artifact);
      byStatus[artifact.processingStatus] = list;
    }
    return {
      artifactCount: this.artifacts.length,
      preservedCount: this.artifacts.filter(
        (a) => a.processingStatus === "preserved",
      ).length,
      blockedCount: this.artifacts.filter(
        (a) => a.downstreamEligibility === "blocked",
      ).length,
      duplicateCount: this.artifacts.filter(
        (a) => a.processingStatus === "completed",
      ).length,
      failedCount: this.artifacts.filter((a) => a.processingStatus === "failed")
        .length,
      pendingReviewCount: this.artifacts.filter(
        (a) => a.downstreamEligibility === "pending-human-decision",
      ).length,
      snapshotId: this.snapshot?.snapshotId ?? null,
      reconciliation: this.reconciliation,
      artifactsByStatus: Object.freeze(byStatus),
    };
  }

  findArtifactBySha256(sha256: Sha256): ArtifactRecord | null {
    return this.artifacts.find((a) => a.sha256 === sha256) ?? null;
  }

  findReceiptByArtifactId(artifactId: Uuid): ReceiptRecord | null {
    return this.receipts.find((r) => r.receiptId === artifactId) ?? null;
  }

  reset(): void {
    this.artifacts = [];
    this.receipts = [];
    this.snapshot = null;
    this.reconciliation = null;
  }

  private terminalCategoryFor(
    status: ArtifactRecord["processingStatus"],
  ): TerminalCategory {
    switch (status) {
      case "preserved":
        return "accepted-for-processing";
      case "quarantined":
        return "provisional-safety-block";
      case "failed":
        return "failed";
      case "completed":
        return "accepted-for-processing";
      default:
        return "pending-human-disposition";
    }
  }
}

import type { Sha256 } from "../shared/types";
import type { ArtifactRecord } from "../artifacts/models";
import type {
  GovernedArtifactState,
  RegistryProjection,
} from "./governed-registry";
import type { ManifestExportSummary } from "../../components/inventory/ManifestExport";
import type { ArtifactInventoryItem } from "../../components/inventory/ArtifactInventory";

export interface CaseReadModel {
  readonly caseId: string;
  readonly artifactCount: number;
  readonly preservedCount: number;
  readonly blockedCount: number;
  readonly failedCount: number;
  readonly pendingReviewCount: number;
  readonly snapshotId: string | null;
  readonly governedStatus: "provisional" | "reviewed" | "approved";
  readonly requiredActions: readonly string[];
}

export interface ArtifactReadModel {
  readonly artifactId: string;
  readonly sha256: Sha256;
  readonly status: ArtifactRecord["processingStatus"];
  readonly eligibility: ArtifactRecord["downstreamEligibility"];
  readonly role: ArtifactRecord["artifactRole"];
}

export class ProjectionService {
  projectForManifestExport(
    state: GovernedArtifactState,
  ): ManifestExportSummary {
    const projection = this.project(state);
    return {
      artifactCount: projection.artifactCount,
      validationCount: projection.preservedCount,
      unresolvedCount: projection.blockedCount + projection.failedCount,
      accountingStatus:
        projection.failedCount === 0
          ? "Awaiting human review"
          : "Partial — some files failed",
      provisionalBlockReason:
        projection.artifactCount === 0
          ? "No evidence files were available for processing."
          : "Evidence is pending until all required reviews are complete.",
      requiredReview:
        "Review quarantine, classification, relationship, and population queues.",
      nextAction: "Complete all reviews, then export the final manifest.",
      deterministicManifestHash: state.snapshot?.snapshotId ?? "0".repeat(64),
      lineage:
        state.snapshot?.entries.map((entry, index) => ({
          nodeId: `artifact-${String(index + 1)}`,
          label: entry.observedRelativePath,
          sourceHash: entry.sha256,
          sourceLocator: entry.observedRelativePath,
          status: "provisional" as const,
        })) ?? [],
    };
  }

  projectForInventory(state: GovernedArtifactState): ArtifactInventoryItem[] {
    return state.artifacts.map((artifact) => ({
      id: artifact.artifactId,
      path: artifact.artifactId,
      sizeBytes: 0,
      sha256: artifact.sha256,
      status: this.inventoryStatusFor(artifact.processingStatus),
      message: this.messageFor(artifact.processingStatus),
    }));
  }

  projectForCase(caseId: string, state: GovernedArtifactState): CaseReadModel {
    const projection = this.project(state);
    const requiredActions: string[] = [];
    if (projection.pendingReviewCount > 0) {
      requiredActions.push(
        `${String(projection.pendingReviewCount)} artifact(s) awaiting human review`,
      );
    }
    if (projection.failedCount > 0) {
      requiredActions.push(
        `${String(projection.failedCount)} artifact(s) failed processing`,
      );
    }
    return {
      caseId,
      artifactCount: projection.artifactCount,
      preservedCount: projection.preservedCount,
      blockedCount: projection.blockedCount,
      failedCount: projection.failedCount,
      pendingReviewCount: projection.pendingReviewCount,
      snapshotId: projection.snapshotId,
      governedStatus: this.governedStatusFor(projection),
      requiredActions: Object.freeze(requiredActions),
    };
  }

  project(state: GovernedArtifactState): RegistryProjection {
    const byStatus: Record<string, ArtifactRecord[]> = {};
    for (const artifact of state.artifacts) {
      const list = byStatus[artifact.processingStatus] ?? [];
      list.push(artifact);
      byStatus[artifact.processingStatus] = list;
    }
    return {
      artifactCount: state.artifacts.length,
      preservedCount: state.artifacts.filter(
        (a) => a.processingStatus === "preserved",
      ).length,
      blockedCount: state.artifacts.filter(
        (a) => a.downstreamEligibility === "blocked",
      ).length,
      duplicateCount: state.artifacts.filter(
        (a) => a.processingStatus === "completed",
      ).length,
      failedCount: state.artifacts.filter(
        (a) => a.processingStatus === "failed",
      ).length,
      pendingReviewCount: state.artifacts.filter(
        (a) => a.downstreamEligibility === "pending-human-decision",
      ).length,
      snapshotId: state.snapshot?.snapshotId ?? null,
      reconciliation: state.reconciliation,
      artifactsByStatus: Object.freeze(byStatus),
    };
  }

  projectArtifacts(state: GovernedArtifactState): readonly ArtifactReadModel[] {
    return state.artifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      sha256: artifact.sha256,
      status: artifact.processingStatus,
      eligibility: artifact.downstreamEligibility,
      role: artifact.artifactRole,
    }));
  }

  private inventoryStatusFor(
    status: ArtifactRecord["processingStatus"],
  ): ArtifactInventoryItem["status"] {
    switch (status) {
      case "preserved":
        return "preserved";
      case "quarantined":
        return "provisional-blocked";
      case "failed":
        return "failed";
      case "completed":
        return "preserved";
      default:
        return "queued";
    }
  }

  private messageFor(status: ArtifactRecord["processingStatus"]): string {
    switch (status) {
      case "preserved":
        return "File preserved. Downstream use blocked until all reviews complete.";
      case "quarantined":
        return "Safety review needed. An authorized reviewer must decide before use.";
      case "failed":
        return "Processing failed.";
      case "completed":
        return "Processing complete.";
      case "pending":
        return "Awaiting processing.";
      default:
        return "Awaiting deterministic hash.";
    }
  }

  private governedStatusFor(
    projection: RegistryProjection,
  ): "provisional" | "reviewed" | "approved" {
    if (projection.artifactCount === 0) return "provisional";
    if (projection.pendingReviewCount > 0) return "provisional";
    if (projection.blockedCount > 0) return "provisional";
    return "reviewed";
  }
}

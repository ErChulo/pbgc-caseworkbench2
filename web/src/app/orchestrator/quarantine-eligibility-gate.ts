import type { ArtifactEligibilityReviewItem } from "../../components/review/ArtifactEligibilityReview";
import type { QuarantineQueueItem } from "../../components/quarantine/QuarantineQueue";
import type {
  ArtifactEligibilityDecision,
  ArtifactEligibilityProjection,
  QuarantineDecision,
} from "../../domain/quarantine/models";

export function decisionCoversFindings(
  decision: QuarantineDecision | undefined,
  findingIds: readonly string[],
): boolean {
  return (
    decision?.resultingStatus === "released" &&
    findingIds.length > 0 &&
    findingIds.every((id) => decision.findingIds.includes(id))
  );
}

/** Constrain replayed eligibility by the latest observed safety hold, not just byte identity. */
export function gateEligibilityByCurrentFindings(
  item: ArtifactEligibilityReviewItem,
  quarantine: QuarantineQueueItem | undefined,
  quarantineDecisions: readonly QuarantineDecision[],
  eligibilityDecisions: readonly ArtifactEligibilityDecision[],
  projection: ArtifactEligibilityProjection,
): ArtifactEligibilityReviewItem {
  const requiresQuarantineRelease =
    item.requiresQuarantineRelease || quarantine !== undefined;
  if (!requiresQuarantineRelease) return { ...item, projection };
  const release = quarantineDecisions.at(-1);
  const quarantineReleased =
    quarantine !== undefined &&
    decisionCoversFindings(release, quarantine.findingIds);
  const lastEligibility = eligibilityDecisions.at(-1);
  const source = quarantineDecisions.find(
    (decision) =>
      decision.decisionId === lastEligibility?.sourceQuarantineDecisionId &&
      decision.decisionContentSha256 ===
        lastEligibility.sourceQuarantineDecisionContentSha256,
  );
  const approvedForFindings =
    lastEligibility?.action === "inherit-approval" &&
    quarantine !== undefined &&
    decisionCoversFindings(source, quarantine.findingIds);
  return {
    ...item,
    requiresQuarantineRelease,
    quarantineReleased,
    projection:
      projection.eligible && (!quarantineReleased || !approvedForFindings)
        ? { ...projection, eligible: false, effectiveStatus: "blocked" }
        : projection,
  };
}

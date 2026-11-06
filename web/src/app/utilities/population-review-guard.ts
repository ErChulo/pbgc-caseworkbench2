import type { PopulationReviewItem } from "../../components/review/PopulationReview";

/** Existing decisions may still be revoked or superseded when inspection changes. */
export function populationReviewBlocker(
  item: PopulationReviewItem,
  action: "approve" | "reject" | "revoke" | "supersede",
): string | null {
  if (action !== "approve" || item.workbook === undefined) return null;
  if (item.workbook.status !== "profiled")
    return "The workbook profile is blocked. Resolve the inspection findings before approval.";
  if (item.namedRanges === undefined)
    return "The workbook was inspected without defined-name inventory. Re-inspect it before approval.";
  return null;
}

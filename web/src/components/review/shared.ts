import { GLOSSARY } from "../../domain/shared/glossary";

/**
 * Plain-language placeholder used by every rationale textarea across the
 * review components so the help sentence stays consistent.
 */
export const RATIONALE_PLACEHOLDER =
  "State the reason for each decision you record.";

/**
 * The four typed human decisions that a reviewer can record against any
 * proposal reviewed by ClassificationReview, RelationshipReview, or
 * PopulationReview. Buttons are disabled in invalid combinations elsewhere.
 */
export type ReviewAction = "approve" | "reject" | "revoke" | "supersede";

export const REVIEW_ACTIONS: readonly ReviewAction[] = [
  "approve",
  "reject",
  "revoke",
  "supersede",
] as const;

export const ACTION_LABELS: Record<ReviewAction, string> = {
  approve: "Approve",
  reject: "Reject",
  revoke: "Withdraw approval",
  supersede: "Replace with new decision",
};

export const ACTION_TOOLTIPS: Record<ReviewAction, string> = {
  approve: GLOSSARY.approved.tooltip,
  reject: GLOSSARY.rejected.tooltip,
  revoke: GLOSSARY.revoked.tooltip,
  supersede: GLOSSARY.superseded.tooltip,
};

/**
 * Returns the plain-language version of a governed status string. Used for
 * rendering so caseworkers see consistent wording instead of internal codes.
 */
export function plainStatus(status: string): string {
  switch (status) {
    case "proposed":
      return GLOSSARY.proposed.plain;
    case "unresolved":
      return GLOSSARY.unresolved.plain;
    case "approved":
      return GLOSSARY.approved.plain;
    case "rejected":
      return GLOSSARY.rejected.plain;
    case "revoked":
      return GLOSSARY.revoked.plain;
    case "superseded":
      return GLOSSARY.superseded.plain;
  case "provisional":
    return GLOSSARY.proposed.plain;
  default:
      return status;
  }
}

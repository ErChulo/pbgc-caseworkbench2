import type { Result, Sha256 } from "../shared/types";
import type {
  AuthorityProjection,
  ClassificationReplayError,
  DecisionProjection,
} from "./models";

export interface ProductionGateInput {
  readonly artifactSha256: Sha256;
  readonly classification: DecisionProjection;
  readonly relationship?: DecisionProjection;
  readonly authority?: AuthorityProjection;
  readonly authorityRequired: boolean;
}

export function evaluateProductionGate(
  input: ProductionGateInput,
): Result<true, ClassificationReplayError> {
  if (input.classification.status !== "approved")
    return blocked("A current human-approved classification is required.");
  if (input.relationship && input.relationship.status !== "approved")
    return blocked("A current human-approved relationship is required.");
  if (
    input.authorityRequired &&
    (!input.authority ||
      !input.authority.authoritative ||
      input.authority.status !== "approved" ||
      input.authority.artifactSha256 !== input.artifactSha256)
  )
    return blocked(
      "A separate current exact-byte human AuthorityDecision is required.",
    );
  return { ok: true, value: true };
}

function blocked(
  safeMessage: string,
): Result<never, ClassificationReplayError> {
  return { ok: false, error: { code: "INEFFECTIVE_APPROVAL", safeMessage } };
}

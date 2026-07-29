import { hashTyped } from "../manifests/canonical-json";
import { parseSha256, type Result, type Sha256 } from "../shared/types";
import type { FormulaApprovalRecord } from "./models";

export async function formulaApprovalContentHash(
  decision:
    | FormulaApprovalRecord
    | Omit<FormulaApprovalRecord, "decisionContentSha256">,
): Promise<Sha256> {
  const { decisionContentSha256: ignored, ...content } =
    decision as FormulaApprovalRecord;
  void ignored;
  const parsed = parseSha256(
    await hashTyped(content, { typeName: "FormulaApprovalRecordContent" }),
  );
  if (!parsed.ok) throw new Error("Formula approval content hash failed.");
  return parsed.value;
}

export async function replayFormulaApprovals(
  decisions: readonly FormulaApprovalRecord[],
): Promise<Result<FormulaApprovalRecord, string>> {
  let prior: FormulaApprovalRecord | null = null;
  const seen = new Set<string>();
  for (const decision of decisions) {
    if (
      seen.has(decision.decisionId) ||
      decision.appendOrdinal !== (prior?.appendOrdinal ?? 0) + 1 ||
      (prior === null
        ? decision.priorDecisionId !== null ||
          decision.priorDecisionContentSha256 !== null
        : decision.priorDecisionId !== prior.decisionId ||
          decision.priorDecisionContentSha256 !== prior.decisionContentSha256 ||
          decision.decidedAt <= prior.decidedAt)
    )
      return failure("Formula approval chain must be gapless and hash-bound.");
    if (
      prior !== null &&
      (decision.formulaText !== prior.formulaText ||
        JSON.stringify(decision.target) !== JSON.stringify(prior.target) ||
        decision.scenarioId !== prior.scenarioId ||
        decision.iobClassification !== prior.iobClassification)
    )
      return failure(
        "Formula approval chain changes its bound formula identity.",
      );
    if (
      decision.humanActor.actorKey.trim() === "" ||
      decision.rationale.trim() === "" ||
      decision.derivationDescription.trim() === "" ||
      decision.affectedTestIds.length === 0 ||
      decision.validationOracleIds.length === 0 ||
      decision.regenerationImpact.trim() === "" ||
      decision.sourcePlanRules.length === 0
    )
      return failure("Formula approval review evidence is incomplete.");
    if (
      (await formulaApprovalContentHash(decision)) !==
      decision.decisionContentSha256
    )
      return failure("Formula approval content hash is invalid.");
    const validTransition =
      prior === null
        ? decision.decisionType === "approve" &&
          decision.resultingStatus === "approved"
        : prior.resultingStatus === "approved" &&
          ((decision.decisionType === "revoke" &&
            decision.resultingStatus === "revoked") ||
            (decision.decisionType === "supersede" &&
              decision.resultingStatus === "superseded"));
    if (!validTransition)
      return failure("Formula approval transition is invalid.");
    prior = decision;
    seen.add(decision.decisionId);
  }
  return prior?.resultingStatus === "approved"
    ? { ok: true, value: prior }
    : failure("Formula has no effective non-revoked approval.");
}

function failure(error: string): Result<never, string> {
  return { ok: false, error };
}

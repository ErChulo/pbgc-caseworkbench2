import type {
  DeterministicProposalPayload,
  ProposalDecisionRecord,
  ProposalGovernedStatus,
  PromotedFact,
} from "./models";
import { deterministicSha256 } from "../normalization/normalizer";
import { parseSha256, type Result, type Sha256 } from "../shared/types";

export async function proposalDecisionHash(
  decision: Omit<
    ProposalDecisionRecord,
    | "decisionId"
    | "decisionContentSha256"
    | "humanActor"
    | "rationale"
    | "decisionTimestamp"
  >,
): Promise<Sha256> {
  return deterministicSha256({
    appendOrdinal: decision.appendOrdinal,
    priorDecisionContentSha256: decision.priorDecisionContentSha256,
    proposalSha256: decision.proposalSha256,
    decisionType: decision.decisionType,
    resultingGovernedStatus: decision.resultingGovernedStatus,
    ruleSetVersion: decision.ruleSetVersion,
    schemaVersion: decision.schemaVersion,
  });
}

export async function replayProposalDecisions(
  proposalSha256: Sha256,
  decisions: readonly ProposalDecisionRecord[],
): Promise<Result<ProposalGovernedStatus | "provisional", string>> {
  let prior: ProposalDecisionRecord | null = null;
  const ids = new Set<string>();
  for (const decision of decisions) {
    if (
      (decision.humanActor as { readonly actorType?: unknown }).actorType !==
        "human" ||
      decision.proposalSha256 !== proposalSha256
    )
      return error("Decision actor or proposal subject is invalid.");
    if (
      ids.has(decision.decisionId) ||
      decision.appendOrdinal !== (prior?.appendOrdinal ?? 0) + 1 ||
      (prior === null
        ? decision.priorDecisionId !== null ||
          decision.priorDecisionContentSha256 !== null
        : decision.priorDecisionId !== prior.decisionId ||
          decision.priorDecisionContentSha256 !== prior.decisionContentSha256)
    )
      return error(
        "Decision chain is gapped, branched, or has a broken predecessor.",
      );
    if (
      (await proposalDecisionHash(decision)) !== decision.decisionContentSha256
    )
      return error("Decision content hash is stale.");
    if (
      !validTransition(
        prior?.resultingGovernedStatus ?? null,
        decision.decisionType,
        decision.resultingGovernedStatus,
      )
    )
      return error("Decision transition is prohibited.");
    prior = decision;
    ids.add(decision.decisionId);
  }
  return { ok: true, value: prior?.resultingGovernedStatus ?? "provisional" };
}

export async function validatePromotedFact(
  proposal: DeterministicProposalPayload,
  proposalSha256: Sha256,
  decisions: readonly ProposalDecisionRecord[],
  promoted: PromotedFact,
): Promise<Result<true, string>> {
  const replay = await replayProposalDecisions(proposalSha256, decisions);
  if (!replay.ok || replay.value !== "approved")
    return error("Promoted facts require a current effective approval.");
  const decision = decisions.at(-1);
  if (
    decision?.decisionId !== promoted.effectiveApprovalDecisionId ||
    promoted.sourceProposalSha256 !== proposalSha256
  )
    return error("Promotion decision lineage is invalid.");
  const fact = proposal.proposedExtractedFacts.find(
    (item) => item.factKey === promoted.factKey,
  );
  if (
    !fact ||
    promoted.factJsonPointer !== pointerForFact(proposal, fact.factKey)
  )
    return error("Promoted fact pointer is invalid or ambiguous.");
  const expected = await deterministicSha256({
    factKey: fact.factKey,
    factJsonPointer: promoted.factJsonPointer,
    value: fact.value,
  });
  if (expected !== promoted.factContentSha256)
    return error("Promoted fact content hash is invalid.");
  if (
    promoted.citationIds.some(
      (citationId) =>
        !fact.citationIds.includes(citationId) ||
        !proposal.sourceCitations.some(
          (citation) =>
            citation.citationId === citationId &&
            promoted.artifactSha256Values.includes(citation.artifactSha256),
        ),
    )
  )
    return error("Promoted fact citation lineage is invalid.");
  return { ok: true, value: true };
}

export function pointerForFact(
  proposal: DeterministicProposalPayload,
  factKey: string,
): string {
  const index = proposal.proposedExtractedFacts.findIndex(
    (fact) => fact.factKey === factKey,
  );
  return index < 0 ? "" : `/proposedExtractedFacts/${String(index)}/value`;
}

export function asSha256(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new TypeError("Lowercase SHA-256 required.");
  return parsed.value;
}

function validTransition(
  prior: ProposalGovernedStatus | null,
  action: ProposalDecisionRecord["decisionType"],
  status: ProposalGovernedStatus,
): boolean {
  if (prior === null)
    return (
      (action === "approve" && status === "approved") ||
      (action === "reject" && status === "rejected")
    );
  if (prior === "approved")
    return (
      (action === "revoke" && status === "revoked") ||
      (action === "supersede" && status === "superseded")
    );
  if (prior === "rejected" || prior === "revoked")
    return action === "supersede" && status === "superseded";
  return false;
}

function error(message: string): Result<never, string> {
  return { ok: false, error: message };
}

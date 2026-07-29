import { hashTyped } from "../manifests/canonical-json";
import { parseSha256, type Result, type Sha256 } from "../shared/types";

export {
  createUnresolvedItem,
  hiddenContentUnresolvedInput,
  replayResolutionHistory,
  resolveItem,
  staleSourceUnresolvedInput,
  surfaceHiddenContentFlag,
  unresolvedItemEmitters,
  validateUnresolvedItem,
} from "../plan-rules/unresolved-items";

export interface UnresolvedItem {
  readonly itemKey: Sha256;
  readonly affectedScope: string;
  readonly evidence: readonly string[];
  readonly competingPossibilities: readonly string[];
  readonly downstreamConsequence: string;
  readonly responsibleQueue: string;
  readonly status: "open" | "assigned";
}

export interface UnresolvedItemDecision {
  readonly decisionId: string;
  readonly decisionContentSha256: Sha256;
  readonly appendOrdinal: number;
  readonly priorDecisionId: string | null;
  readonly priorDecisionContentSha256: Sha256 | null;
  readonly itemKey: Sha256;
  readonly decisionType: "resolve" | "accept-risk" | "reopen" | "supersede";
  readonly resultingStatus:
    "resolved" | "accepted-risk" | "reopened" | "superseded";
  readonly actor: { readonly actorType: "human"; readonly actorId: string };
  readonly rationale: string;
  readonly decidedAt: string;
  readonly ruleSetVersion: string;
}

export async function unresolvedDecisionHash(
  value: Omit<
    UnresolvedItemDecision,
    "decisionId" | "decisionContentSha256" | "actor" | "rationale" | "decidedAt"
  >,
): Promise<Sha256> {
  return sha(
    await hashTyped(
      {
        appendOrdinal: value.appendOrdinal,
        priorDecisionContentSha256: value.priorDecisionContentSha256,
        itemKey: value.itemKey,
        decisionType: value.decisionType,
        resultingStatus: value.resultingStatus,
        ruleSetVersion: value.ruleSetVersion,
      },
      {},
    ),
  );
}

export async function replayUnresolvedDecisions(
  item: UnresolvedItem,
  decisions: readonly UnresolvedItemDecision[],
): Promise<
  Result<string, { readonly code: string; readonly safeMessage: string }>
> {
  if (!["open", "assigned"].includes(item.status))
    return fail(
      "PROPOSAL_ONLY",
      "Unresolved source status must remain provisional.",
    );
  let prior: UnresolvedItemDecision | null = null;
  for (const decision of decisions) {
    if (
      (decision.actor as { readonly actorType?: unknown }).actorType !==
        "human" ||
      decision.itemKey !== item.itemKey
    )
      return fail("SUBJECT_INVALID", "Decision actor or subject is invalid.");
    if (
      decision.appendOrdinal !== (prior?.appendOrdinal ?? 0) + 1 ||
      (prior === null
        ? decision.priorDecisionId !== null ||
          decision.priorDecisionContentSha256 !== null
        : decision.priorDecisionId !== prior.decisionId ||
          decision.priorDecisionContentSha256 !== prior.decisionContentSha256)
    )
      return fail("CHAIN_INVALID", "Decision predecessor chain is invalid.");
    if (
      (await unresolvedDecisionHash(decision)) !==
      decision.decisionContentSha256
    )
      return fail("HASH_INVALID", "Decision content hash is invalid.");
    if (!transition(prior?.resultingStatus ?? null, decision))
      return fail("TRANSITION_INVALID", "Decision transition is invalid.");
    prior = decision;
  }
  return { ok: true, value: prior?.resultingStatus ?? item.status };
}

function transition(
  prior: UnresolvedItemDecision["resultingStatus"] | null,
  next: UnresolvedItemDecision,
): boolean {
  if (prior === null)
    return (
      (next.decisionType === "resolve" &&
        next.resultingStatus === "resolved") ||
      (next.decisionType === "accept-risk" &&
        next.resultingStatus === "accepted-risk")
    );
  if (prior === "resolved" || prior === "accepted-risk")
    return (
      next.decisionType === "reopen" && next.resultingStatus === "reopened"
    );
  if (prior === "reopened")
    return (
      (next.decisionType === "resolve" &&
        next.resultingStatus === "resolved") ||
      (next.decisionType === "accept-risk" &&
        next.resultingStatus === "accepted-risk") ||
      (next.decisionType === "supersede" &&
        next.resultingStatus === "superseded")
    );
  return false;
}

function sha(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new Error("Internal unresolved-item hash failed.");
  return parsed.value;
}

function fail(code: string, safeMessage: string) {
  return { ok: false, error: { code, safeMessage } } as const;
}

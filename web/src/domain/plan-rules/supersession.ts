import { hashTyped } from "../manifests/canonical-json";
import { parseSha256, type Uuid } from "../shared/types";
import { restatementSimilarity } from "./near-duplicates";
import { planRuleRuleSetVersion } from "./models";
import type {
  ProvisionCandidate,
  PlanRuleRecord,
  SupersessionLink,
  SupersessionProposal,
} from "./models";

export async function detectSupersession(
  candidates: readonly ProvisionCandidate[],
): Promise<readonly SupersessionProposal[]> {
  const dated = candidates
    .filter(
      (
        candidate,
      ): candidate is ProvisionCandidate & { extractedEffectiveDate: string } =>
        candidate.extractedEffectiveDate !== null,
    )
    .sort(
      (left, right) =>
        left.extractedEffectiveDate.localeCompare(
          right.extractedEffectiveDate,
        ) ||
        left.candidateContentSha256.localeCompare(right.candidateContentSha256),
    );
  const proposals: SupersessionProposal[] = [];
  for (
    let predecessorIndex = 0;
    predecessorIndex < dated.length;
    predecessorIndex += 1
  ) {
    for (
      let successorIndex = predecessorIndex + 1;
      successorIndex < dated.length;
      successorIndex += 1
    ) {
      const predecessor = dated[predecessorIndex];
      const successor = dated[successorIndex];
      if (
        !predecessor ||
        !successor ||
        predecessor.extractedEffectiveDate >=
          successor.extractedEffectiveDate ||
        predecessor.provisionIdentifier !== successor.provisionIdentifier
      )
        continue;
      const similarity = restatementSimilarity(
        predecessor.normalizedRestatement,
        successor.normalizedRestatement,
      );
      const amendmentLanguage =
        /\b(?:amend(?:ed|ment)?|restat(?:ed|ement)|replac(?:e|es|ed|ement)|supersed(?:e|es|ed|ing))\b/iu.test(
          successor.verbatimText,
        );
      if (!amendmentLanguage && similarity < 0.72) continue;
      const relationshipType: SupersessionProposal["relationshipType"] =
        /\b(?:replac(?:e|es|ed|ement)|supersed(?:e|es|ed|ing))\b/iu.test(
          successor.verbatimText,
        )
          ? "supersession"
          : "amendment";
      const confidence = Number(
        Math.min(
          0.99,
          similarity * 0.7 + (amendmentLanguage ? 0.25 : 0),
        ).toFixed(6),
      );
      const core = {
        fromSha256: predecessor.candidateContentSha256,
        toSha256: successor.candidateContentSha256,
        predecessorCandidateId: predecessor.candidateId,
        successorCandidateId: successor.candidateId,
        predecessorCandidateContentSha256: predecessor.candidateContentSha256,
        successorCandidateContentSha256: successor.candidateContentSha256,
        effectiveDate: successor.extractedEffectiveDate,
        confidence,
        relationshipType,
        status: "proposed" as const,
        supportingEvidence: [
          {
            evidenceType: "metadata" as const,
            value: `successor-effective-date:${successor.extractedEffectiveDate}`,
            sourceLocator: successor.artifactLocator,
          },
          {
            evidenceType: "metadata" as const,
            value: `predecessor-effective-date:${predecessor.extractedEffectiveDate}`,
            sourceLocator: predecessor.artifactLocator,
          },
        ],
        ruleSetVersion: planRuleRuleSetVersion,
      };
      const hash = parseSha256(
        await hashTyped(core, { typeName: "ProvisionSupersessionProposal" }),
      );
      if (!hash.ok) throw new Error("Supersession relationship hash failed.");
      proposals.push({ ...core, relationshipKey: hash.value });
    }
  }
  return Object.freeze(proposals);
}

export interface SupersessionChain {
  readonly links: readonly SupersessionLink[];
  readonly currentRuleId: Uuid | null;
}

export function buildSupersessionChain(
  rule: PlanRuleRecord,
): SupersessionChain {
  return {
    links: [...rule.supersessionChain].sort((a, b) => a.ordinal - b.ordinal),
    currentRuleId: rule.ruleId,
  };
}

export function findEffectiveRuleAtDate(
  rules: readonly PlanRuleRecord[],
  effectiveDate: string,
): Uuid | null {
  return (
    [...rules]
      .filter(
        (rule) =>
          rule.effectiveDate <= effectiveDate &&
          (rule.endDate === null || effectiveDate < rule.endDate),
      )
      .sort((left, right) =>
        right.effectiveDate.localeCompare(left.effectiveDate),
      )[0]?.ruleId ?? null
  );
}

export function detectCircularSupersession(
  rules: readonly PlanRuleRecord[],
): boolean {
  const visited = new Set<string>();
  const active = new Set<string>();
  const byPredecessor = new Map<string, string[]>();
  for (const rule of rules) {
    const predecessor = rule.supersessionChain.at(-1)?.predecessorRuleId;
    if (predecessor === null || predecessor === undefined) continue;
    const successors = byPredecessor.get(predecessor) ?? [];
    successors.push(rule.ruleId);
    byPredecessor.set(predecessor, successors);
  }
  const visit = (ruleId: string): boolean => {
    if (active.has(ruleId)) return true;
    if (visited.has(ruleId)) return false;
    visited.add(ruleId);
    active.add(ruleId);
    for (const successor of byPredecessor.get(ruleId) ?? []) {
      if (visit(successor)) return true;
    }
    active.delete(ruleId);
    return false;
  };
  return rules.some((rule) => visit(rule.ruleId));
}

export function validateSupersessionLink(
  link: SupersessionLink,
  existingRuleIds: readonly Uuid[],
): boolean {
  if (link.predecessorRuleId !== null) {
    if (!existingRuleIds.includes(link.predecessorRuleId)) {
      return false;
    }
  }

  return true;
}

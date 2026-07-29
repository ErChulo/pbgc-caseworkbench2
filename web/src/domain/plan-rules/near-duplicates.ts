import { hashTyped } from "../manifests/canonical-json";
import { parseSha256, type Sha256 } from "../shared/types";
import type { EvidenceRelationship } from "../classification/models";
import { planRuleRuleSetVersion, type ProvisionCandidate } from "./models";

const threshold = 0.72;

export async function detectNearDuplicates(
  candidates: readonly ProvisionCandidate[],
): Promise<readonly EvidenceRelationship[]> {
  const ordered = [...candidates].sort((left, right) =>
    left.candidateContentSha256.localeCompare(right.candidateContentSha256),
  );
  const relationships: EvidenceRelationship[] = [];
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < ordered.length;
      rightIndex += 1
    ) {
      const left = ordered[leftIndex];
      const right = ordered[rightIndex];
      if (!left || !right) continue;
      const similarity = restatementSimilarity(
        left.normalizedRestatement,
        right.normalizedRestatement,
      );
      if (similarity < threshold) continue;
      const core = {
        fromSha256: left.candidateContentSha256,
        toSha256: right.candidateContentSha256,
        relationshipType: "near-duplicate" as const,
        status: "proposed" as const,
        confidence: similarity,
        supportingEvidence: [
          {
            evidenceType: "text" as const,
            value: `token-shingle-jaccard:${similarity.toFixed(6)}`,
            sourceLocator: left.artifactLocator,
          },
          {
            evidenceType: "text" as const,
            value: `token-shingle-jaccard:${similarity.toFixed(6)}`,
            sourceLocator: right.artifactLocator,
          },
        ],
        ruleSetVersion: planRuleRuleSetVersion,
      };
      relationships.push({
        ...core,
        relationshipKey: await relationshipKey(core),
      });
    }
  }
  return Object.freeze(relationships);
}

export function restatementSimilarity(left: string, right: string): number {
  const leftShingles = shingles(left);
  const rightShingles = shingles(right);
  if (leftShingles.size === 0 || rightShingles.size === 0)
    return normalize(left) === normalize(right) ? 1 : 0;
  const intersection = [...leftShingles].filter((value) =>
    rightShingles.has(value),
  ).length;
  const union = new Set([...leftShingles, ...rightShingles]).size;
  return Number((intersection / union).toFixed(6));
}

function shingles(value: string): ReadonlySet<string> {
  const tokens = normalize(value).split(" ").filter(Boolean);
  const width = tokens.length < 3 ? 1 : 3;
  return new Set(
    tokens
      .slice(0, tokens.length - width + 1)
      .map((_, index) => tokens.slice(index, index + width).join(" ")),
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

async function relationshipKey(value: object): Promise<string> {
  const parsed = parseSha256(
    await hashTyped(value, { typeName: "ProvisionNearDuplicateRelationship" }),
  );
  if (!parsed.ok) throw new Error("Near-duplicate relationship hash failed.");
  return parsed.value;
}

export function isNearDuplicate(
  candidate1: ProvisionCandidate,
  candidate2: ProvisionCandidate,
): boolean {
  return (
    restatementSimilarity(
      candidate1.normalizedRestatement,
      candidate2.normalizedRestatement,
    ) >= threshold
  );
}

export function getUniqueContentHashes(
  candidates: readonly ProvisionCandidate[],
): readonly Sha256[] {
  return [
    ...new Set(candidates.map((candidate) => candidate.candidateContentSha256)),
  ];
}

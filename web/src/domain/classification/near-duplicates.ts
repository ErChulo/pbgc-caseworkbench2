import { hashTyped } from "../manifests/canonical-json";
import { parseSha256, type Sha256 } from "../shared/types";
import {
  classificationRuleSetVersion,
  type ClassificationEvidence,
  type EvidenceRelationship,
} from "./models";

export function normalizeComparableText(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export async function normalizedTextSha256(value: string): Promise<Sha256> {
  const parsed = parseSha256(
    await hashTyped({ normalizedText: normalizeComparableText(value) }, {}),
  );
  if (!parsed.ok) throw new Error("Normalized text hash failed.");
  return parsed.value;
}

export function tokenShingles(value: string, width = 3): readonly string[] {
  if (!Number.isInteger(width) || width < 1)
    throw new TypeError("Shingle width must be a positive integer.");
  const tokens = normalizeComparableText(value).split(" ").filter(Boolean);
  if (tokens.length < width)
    return Object.freeze(tokens.length ? [tokens.join(" ")] : []);
  return Object.freeze(
    [
      ...new Set(
        tokens
          .slice(0, tokens.length - width + 1)
          .map((_, index) => tokens.slice(index, index + width).join(" ")),
      ),
    ].sort(),
  );
}

export function shingleSimilarity(left: string, right: string): number {
  const a = new Set(tokenShingles(left));
  const b = new Set(tokenShingles(right));
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / (a.size + b.size - intersection);
}

export async function proposeNearDuplicate(
  fromSha256: Sha256,
  toSha256: Sha256,
  leftText: string,
  rightText: string,
  threshold = 0.6,
): Promise<EvidenceRelationship | null> {
  if (fromSha256 === toSha256) return null;
  const confidence = shingleSimilarity(leftText, rightText);
  if (confidence < threshold) return null;
  const supportingEvidence: ClassificationEvidence[] = [
    {
      evidenceType: "text",
      value: `token-shingle-jaccard:${confidence.toFixed(6)}`,
      sourceLocator: "normalized-passive-text",
    },
  ];
  const core = {
    fromSha256,
    toSha256,
    relationshipType: "near-duplicate",
    status: "proposed",
    confidence,
    supportingEvidence,
    ruleSetVersion: classificationRuleSetVersion,
  } as const;
  return Object.freeze({
    ...core,
    relationshipKey: await relationshipKey(core),
  });
}

export async function relationshipKey(value: object): Promise<string> {
  const parsed = parseSha256(await hashTyped(value, {}));
  if (!parsed.ok) throw new Error("Relationship hash failed.");
  return parsed.value;
}

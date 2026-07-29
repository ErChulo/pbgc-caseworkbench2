import { hashTyped } from "../manifests/canonical-json";
import { parseSha256, type Sha256 } from "../shared/types";
import {
  classificationRuleSetVersion,
  type ClassificationEvidence,
  type ClassificationProposal,
} from "./models";

export interface ClassificationInput {
  readonly artifactSha256: Sha256;
  readonly filename: string;
  readonly mediaType: string | null;
  readonly text: string;
}

interface Rule {
  readonly value: string;
  readonly dimension: ClassificationProposal["dimension"];
  readonly patterns: readonly RegExp[];
}

const rules: readonly Rule[] = [
  {
    value: "plan-document",
    dimension: "document-category",
    patterns: [/\bplan document\b/iu, /\bdefined benefit plan\b/iu],
  },
  {
    value: "amendment",
    dimension: "document-category",
    patterns: [/\bamendment\b/iu, /\bhereby amended\b/iu],
  },
  {
    value: "collective-bargaining-agreement",
    dimension: "document-category",
    patterns: [/\bcollective bargaining\b/iu, /\bcba\b/iu],
  },
  {
    value: "notice",
    dimension: "document-category",
    patterns: [/\bnotice\b/iu],
  },
  {
    value: "actuarial-report",
    dimension: "document-category",
    patterns: [/\bactuarial (?:valuation|report)\b/iu],
  },
  {
    value: "authority-candidate",
    dimension: "source-role",
    patterns: [/\bexecuted\b/iu, /\badopted\b/iu, /\bsigned\b/iu],
  },
  {
    value: "historical",
    dimension: "source-role",
    patterns: [/\bhistorical\b/iu, /\bsuperseded\b/iu],
  },
  {
    value: "training",
    dimension: "source-role",
    patterns: [/\btraining\b/iu, /\btutorial\b/iu],
  },
  {
    value: "illustrative",
    dimension: "source-role",
    patterns: [/\bsample\b/iu, /\billustrative\b/iu, /\bexample\b/iu],
  },
];

export async function proposeClassifications(
  input: ClassificationInput,
): Promise<readonly ClassificationProposal[]> {
  const corpus =
    `${input.filename}\n${input.mediaType ?? ""}\n${input.text}`.normalize(
      "NFC",
    );
  const proposals: ClassificationProposal[] = [];
  for (const rule of rules) {
    const matches = rule.patterns.filter((pattern) => pattern.test(corpus));
    if (matches.length === 0) continue;
    const evidence: ClassificationEvidence[] = [
      {
        evidenceType: "text",
        value: matches.map((pattern) => pattern.source).join(" | "),
        sourceLocator: "passive-text",
      },
      {
        evidenceType: "filename",
        value: input.filename.normalize("NFC"),
        sourceLocator: "submitted-filename",
      },
    ];
    const deterministic = {
      artifactSha256: input.artifactSha256,
      dimension: rule.dimension,
      proposedValue: rule.value,
      status: "proposed",
      authorityCandidate: rule.value === "authority-candidate",
      confidence: Math.min(0.99, 0.55 + matches.length * 0.15),
      supportingEvidence: evidence,
      classifierId: "feature-009-deterministic-classifier",
      classifierVersion: "1.0.0",
      ruleSetVersion: classificationRuleSetVersion,
    } as const;
    proposals.push({
      ...deterministic,
      proposalKey: await proposalKey(deterministic),
    });
  }
  if (proposals.length === 0) {
    const evidence: ClassificationEvidence[] = [
      {
        evidenceType: "filename",
        value: input.filename.normalize("NFC"),
        sourceLocator: "submitted-filename",
      },
    ];
    const deterministic = {
      artifactSha256: input.artifactSha256,
      dimension: "document-category",
      proposedValue: "unresolved",
      status: "unresolved",
      authorityCandidate: false,
      confidence: 0,
      supportingEvidence: evidence,
      classifierId: "feature-009-deterministic-classifier",
      classifierVersion: "1.0.0",
      ruleSetVersion: classificationRuleSetVersion,
    } as const;
    proposals.push({
      ...deterministic,
      proposalKey: await proposalKey(deterministic),
    });
  }
  return Object.freeze(
    proposals
      .sort((left, right) => left.proposalKey.localeCompare(right.proposalKey))
      .map((proposal) => Object.freeze(proposal)),
  );
}

async function proposalKey(value: object): Promise<string> {
  const parsed = parseSha256(await hashTyped(value, {}));
  if (!parsed.ok) throw new Error("Deterministic proposal hash failed.");
  return parsed.value;
}

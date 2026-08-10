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
  readonly textLocator?: string;
  readonly analysisSourceLocator?: string;
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
    value: "executed-plan-document",
    dimension: "source-role",
    patterns: [
      /\bexecuted\b[^\n]{0,80}\b(?:plan document|defined benefit plan)\b/iu,
      /\b(?:plan document|defined benefit plan)\b[^\n]{0,80}\b(?:executed|signed)\b/iu,
    ],
  },
  {
    value: "amendment",
    dimension: "source-role",
    patterns: [/\bamendment\b/iu, /\bhereby amended\b/iu],
  },
  {
    value: "collective-bargaining-agreement",
    dimension: "source-role",
    patterns: [/\bcollective bargaining\b/iu, /\bcba\b/iu],
  },
  {
    value: "notice",
    dimension: "source-role",
    patterns: [/\bnotice\b/iu],
  },
  {
    value: "actuarial-report",
    dimension: "source-role",
    patterns: [/\bactuarial (?:valuation|report)\b/iu],
  },
  {
    value: "formal-determination",
    dimension: "source-role",
    patterns: [
      /\bformal (?:legal|pbgc|actuarial) determination\b/iu,
      /\bdetermination letter\b/iu,
    ],
  },
  {
    value: "approved-plan-summary",
    dimension: "source-role",
    patterns: [/\bapproved plan summary\b/iu, /\bsummary plan description\b/iu],
  },
  {
    value: "certified-case-report",
    dimension: "source-role",
    patterns: [/\bcertified case report\b/iu],
  },
  {
    value: "supporting-administrative-report",
    dimension: "source-role",
    patterns: [/\bsupporting administrative report\b/iu],
  },
  {
    value: "approved-historical-calculation-artifact",
    dimension: "source-role",
    patterns: [/\bapproved historical calculation artifact\b/iu],
  },
  {
    value: "regulation",
    dimension: "source-role",
    patterns: [/\bregulation\b/iu, /\bcode of federal regulations\b/iu],
  },
  {
    value: "training-reference",
    dimension: "source-role",
    patterns: [/\btraining\b/iu, /\btutorial\b/iu],
  },
];

export async function proposeClassifications(
  input: ClassificationInput,
): Promise<readonly ClassificationProposal[]> {
  const analysisTextSha256 = await hashTyped(
    { text: input.text },
    { typeName: "ClassificationAnalysisText" },
  );
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
        sourceLocator: input.textLocator ?? "passive-text",
      },
      {
        evidenceType: "filename",
        value: input.filename.normalize("NFC"),
        sourceLocator: "submitted-filename",
      },
      {
        evidenceType: "metadata",
        value: analysisTextSha256,
        sourceLocator:
          input.analysisSourceLocator ?? "analysis-text-content-sha256",
      },
    ];
    const deterministic = {
      artifactSha256: input.artifactSha256,
      dimension: rule.dimension,
      proposedValue: rule.value,
      status: "proposed",
      authorityCandidate:
        rule.dimension === "source-role" &&
        rule.value !== "regulation" &&
        rule.value !== "training-reference",
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
      ...(input.textLocator === undefined
        ? []
        : [
            {
              evidenceType: "text" as const,
              value: "No deterministic classification rule matched this scope.",
              sourceLocator: input.textLocator,
            },
          ]),
      {
        evidenceType: "filename",
        value: input.filename.normalize("NFC"),
        sourceLocator: "submitted-filename",
      },
      {
        evidenceType: "metadata",
        value: analysisTextSha256,
        sourceLocator:
          input.analysisSourceLocator ?? "analysis-text-content-sha256",
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

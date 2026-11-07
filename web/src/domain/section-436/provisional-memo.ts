import { sha256Bytes } from "../shared/digest";
import { parseUtcTimestamp, type Sha256, type Uuid } from "../shared/types";
import type { Section436Citation, Section436Evaluation } from "./models";
import { createProvisionalSection436Preview } from "./provisional-preview";
import { MAX_SECTION_436_FILE_BYTES } from "./replay-verification";
import {
  MAX_SECTION_436_PREVIEW_BYTES,
  verifyProvisionalSection436Preview,
  type ProvisionalSection436Verification,
} from "./provisional-verification";

export interface ProvisionalSection436Memo {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly bytesSha256: Sha256;
  readonly verification: ProvisionalSection436Verification;
}

// Quote untrusted values and expose control/format characters instead of letting
// them create new report lines or alter text direction. This is plain text, not HTML.
function quoted(value: string): string {
  return JSON.stringify(value).replace(
    /[\p{Cc}\p{Cf}\u2028\u2029]/gu,
    (character) => {
      const point = character.codePointAt(0);
      return `\\u{${(point ?? 0).toString(16).toUpperCase()}}`;
    },
  );
}

function citations(lines: string[], entries: readonly Section436Citation[]) {
  for (const citation of entries) {
    lines.push(`    Source SHA-256: ${citation.artifactSha256}`);
    lines.push(`    Locator: ${quoted(citation.sourceLocator)}`);
    lines.push(`    Description: ${quoted(citation.description)}`);
  }
}

/** Regenerates from both local files before rendering; the memo is never approval evidence. */
export async function createProvisionalSection436Memo(
  previewInput: Uint8Array,
  sourceInput: Uint8Array,
  caseId: Uuid,
): Promise<ProvisionalSection436Memo> {
  if (
    previewInput.length === 0 ||
    previewInput.length > MAX_SECTION_436_PREVIEW_BYTES ||
    sourceInput.length === 0 ||
    sourceInput.length > MAX_SECTION_436_FILE_BYTES
  )
    throw new Error("The files are empty or too large.");
  // Snapshot before the first await so the rendered bytes are the verified bytes.
  const previewBytes = new Uint8Array(previewInput);
  const sourceBytes = new Uint8Array(sourceInput);
  const verification = await verifyProvisionalSection436Preview(
    previewBytes,
    sourceBytes,
    caseId,
  );
  // The verifier validates this exact immutable byte snapshot before this parse.
  const wrapper = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(previewBytes),
  ) as { evaluation: Section436Evaluation };
  const timestamp = parseUtcTimestamp(
    wrapper.evaluation.operationalMetadata.evaluatedAt,
  );
  if (!timestamp.ok) throw new Error("The preview timestamp is invalid.");
  // Render the regenerated source data rather than potentially differently
  // normalized strings in a canonically equivalent preview file.
  const regenerated = await createProvisionalSection436Preview(
    sourceBytes,
    caseId,
    timestamp.value,
  );
  const evaluation = regenerated.preview.evaluation;
  const payload = evaluation.deterministicPayload;
  const lines = [
    "PROVISIONAL SECTION 436 REVIEW MEMO — NOT APPROVED CASEWORK",
    "",
    "Local consistency only. Not actuarial approval, independent validation, or final package output.",
    "Review labels and citations are input assertions; source authority and reviewer identity are not verified.",
    "This memo may contain case details. Apply local case-data controls.",
    "",
    `Case ID: ${caseId}`,
    `Evaluation status: ${payload.evaluationStatus} (provisional)`,
    `Conclusion code: ${payload.conclusionCode}`,
    `Plan year start: ${payload.planYearStart === null ? "missing" : quoted(payload.planYearStart)}`,
    `Plan year end: ${payload.planYearEnd === null ? "missing" : quoted(payload.planYearEnd)}`,
    `Limitation effect: ${payload.limitationEffect === null ? "none produced" : quoted(payload.limitationEffect)}`,
    `Evaluation timestamp (local assertion): ${evaluation.operationalMetadata.evaluatedAt}`,
    `Evaluation content SHA-256: ${evaluation.contentSha256}`,
    `Preview content SHA-256: ${verification.previewContentSha256}`,
    `Preview file SHA-256: ${verification.previewFileSha256}`,
    `Input file SHA-256: ${verification.sourceFileSha256}`,
    "",
    "MISSING REQUIRED FACTS",
    ...(payload.missingRequiredFacts.length
      ? payload.missingRequiredFacts.map((value) => `- ${quoted(value)}`)
      : ["- None reported."]),
    "",
    "BLOCKING REASONS",
    ...(payload.blockedReasons.length
      ? payload.blockedReasons.map((value) => `- ${quoted(value)}`)
      : ["- None reported. This does not establish approval."]),
    "",
    "MATCHED RULE IDS",
    ...(payload.matchedRuleIds.length
      ? payload.matchedRuleIds.map((value) => `- ${quoted(value)}`)
      : ["- None reported."]),
    "",
    "SUPPLIED FACTS — REVIEW STATUS IS ASSERTED, NOT VERIFIED",
  ];
  if (!payload.facts.length) lines.push("- None supplied.");
  for (const fact of payload.facts) {
    lines.push(`- Fact key: ${quoted(fact.factKey)}`);
    lines.push(`  Value: ${quoted(fact.value)}; kind: ${fact.valueKind}`);
    lines.push(`  Asserted review status: ${fact.reviewStatus}`);
    citations(lines, fact.citations);
  }
  lines.push("", "SUPPLIED RULES — REVIEW STATUS IS ASSERTED, NOT VERIFIED");
  if (!payload.rules.length) lines.push("- None supplied.");
  for (const rule of payload.rules) {
    lines.push(`- Rule ID: ${quoted(rule.ruleId)}`);
    lines.push(`  Description: ${quoted(rule.description)}`);
    lines.push(
      `  Operator: ${rule.operator}; threshold: ${quoted(rule.aftapPercentageThreshold)}`,
    );
    lines.push(
      `  Conclusion: ${rule.conclusionCode}; effect: ${quoted(rule.limitationEffect)}`,
    );
    lines.push(
      `  Priority: ${String(rule.priority)}; effective date: ${quoted(rule.effectiveDate)}`,
    );
    lines.push(`  Asserted review status: ${rule.reviewStatus}`);
    citations(lines, rule.citations);
  }
  lines.push(
    "",
    "END OF PROVISIONAL MEMO — NOT APPROVAL OR INDEPENDENT VALIDATION",
    "",
  );
  const bytes = new TextEncoder().encode(lines.join("\n"));
  if (bytes.byteLength > 8 * 1024 * 1024)
    throw new Error("The provisional memo is too large to download safely.");
  return { bytes, bytesSha256: await sha256Bytes(bytes), verification };
}

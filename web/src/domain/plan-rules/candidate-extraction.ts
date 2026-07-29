import type { PassiveExtraction } from "../../adapters/parsers/passive-result";
import type { PdfTextSpan } from "../../adapters/parsers/pdf-parser";
import type { WorkbookCellObservation } from "../../adapters/parsers/workbook-parser";
import { hashTyped } from "../manifests/canonical-json";
import type { Result, Sha256, UtcTimestamp, Uuid } from "../shared/types";
import { parseSha256, parseUtcTimestamp, parseUuid } from "../shared/types";
import {
  planRuleRuleSetVersion,
  type ProvisionCandidate,
  type UnresolvedItem,
} from "./models";
import { createUnresolvedItem } from "./unresolved-items";

const classifierId = "feature-001-deterministic-candidate-extractor";
const classifierVersion = "1.0.0";

export interface CandidateExtractionInput {
  readonly artifactSha256: string;
  readonly artifactLocator: string;
  readonly provisionIdentifier: string;
  readonly verbatimText: string;
  readonly normalizedRestatement: string;
  readonly extractedEffectiveDate: string | null;
  readonly extractedAdoptionDate: string | null;
  readonly dateExtractionConvention:
    "explicit" | "inferred-from-context" | "unknown";
  readonly confidence: number;
  readonly classifierId: string;
  readonly classifierVersion: string;
  readonly ruleSetVersion: string;
  readonly status?: ProvisionCandidate["status"];
  readonly linkedUnresolvedItemIds?: readonly Uuid[];
}

export interface ExtractionOptions {
  readonly sourceSection?: "case-evidence" | "reference-only";
  readonly openedAt?: string;
}

export interface CandidateAuthorityContext {
  readonly candidateContentSha256: Sha256;
  readonly authority:
    | "case-evidence-proposal"
    | "non-authoritative-reference"
    | "non-authoritative-example";
  readonly authorityOverrideRequired: boolean;
  readonly eligibleForRuleAuthoring: boolean;
}

export interface CandidateExtractionBatch {
  readonly candidates: readonly ProvisionCandidate[];
  readonly unresolvedItems: readonly UnresolvedItem[];
  readonly authorityContexts: readonly CandidateAuthorityContext[];
}

export interface ExtractionError {
  readonly code:
    | "INVALID_ARTIFACT_HASH"
    | "INVALID_PASSIVE_OUTPUT"
    | "INVALID_OPENED_AT"
    | "HASH_COMPUTATION_FAILED";
  readonly message: string;
}

export interface ExtractedDate {
  readonly value: string | null;
  readonly convention: "explicit" | "inferred-from-context" | "unknown";
  readonly ambiguousValues: readonly string[];
}

interface Segment {
  readonly locator: string;
  readonly text: string;
  readonly provisionIdentifier: string;
  readonly kind: "provision" | "formula" | "example";
}

export async function extractCandidates(
  artifactSha256: string,
  parsedOutput: PassiveExtraction,
  options: ExtractionOptions = {},
): Promise<Result<CandidateExtractionBatch, ExtractionError>> {
  const parsedSha = parseSha256(artifactSha256);
  if (!parsedSha.ok) {
    return failure("INVALID_ARTIFACT_HASH", parsedSha.error.message);
  }
  if (!new Set(["success", "partial"]).has(parsedOutput.status)) {
    return failure(
      "INVALID_PASSIVE_OUTPUT",
      `Passive extraction status ${parsedOutput.status} cannot produce candidates.`,
    );
  }
  if (
    parsedOutput.parserId === "pdf-passive" &&
    parsedOutput.text.length > 0 &&
    (parsedOutput.rawValues.length === 0 ||
      !parsedOutput.rawValues.every(isPdfTextSpan) ||
      parsedOutput.rawValues
        .filter(isPdfTextSpan)
        .map((span) => span.verbatimText)
        .join("\n") !== parsedOutput.text)
  ) {
    return failure(
      "INVALID_PASSIVE_OUTPUT",
      "PDF candidate extraction requires page-mapped passive text spans.",
    );
  }

  const openedAt = parseUtcTimestamp(
    options.openedAt ?? new Date().toISOString(),
  );
  if (!openedAt.ok) return failure("INVALID_OPENED_AT", openedAt.error.message);

  const segments = extractSegments(parsedOutput);
  const candidates: ProvisionCandidate[] = [];
  const unresolvedItems: UnresolvedItem[] = [];
  const authorityContexts: CandidateAuthorityContext[] = [];

  for (const segment of segments) {
    const effective = extractEffectiveDate(segment.text, parsedOutput.metadata);
    const adoption = extractAdoptionDate(segment.text, parsedOutput.metadata);
    const issueKinds = issueKindsFor(segment, effective, adoption);
    const unresolvedItemIds = await Promise.all(
      issueKinds.map(async (kind) =>
        deterministicUuid(
          await hashTyped(
            {
              artifactSha256: parsedSha.value,
              locator: segment.locator,
              kind,
            },
            { typeName: "CandidateExtractionUnresolvedIdentity" },
          ),
        ),
      ),
    );
    const dateExtractionConvention = combineDateConventions(
      effective.convention,
      adoption.convention,
    );
    const candidate = await extractProvisionCandidate({
      artifactSha256: parsedSha.value,
      artifactLocator: segment.locator,
      provisionIdentifier: segment.provisionIdentifier,
      verbatimText: segment.text,
      normalizedRestatement: normalizeRestatement(segment.text),
      extractedEffectiveDate: effective.value,
      extractedAdoptionDate: adoption.value,
      dateExtractionConvention,
      confidence: confidenceFor(segment, effective, adoption, issueKinds),
      classifierId,
      classifierVersion,
      ruleSetVersion: planRuleRuleSetVersion,
      status: issueKinds.length === 0 ? "proposed" : "unresolved",
      linkedUnresolvedItemIds:
        issueKinds.length === 0 ? undefined : unresolvedItemIds,
    });
    if (!candidate.ok) {
      return failure("HASH_COMPUTATION_FAILED", candidate.error);
    }
    candidates.push(candidate.value);
    authorityContexts.push({
      candidateContentSha256: candidate.value.candidateContentSha256,
      authority:
        segment.kind === "example"
          ? "non-authoritative-example"
          : options.sourceSection === "reference-only"
            ? "non-authoritative-reference"
            : "case-evidence-proposal",
      authorityOverrideRequired: options.sourceSection === "reference-only",
      eligibleForRuleAuthoring:
        segment.kind !== "example" &&
        options.sourceSection !== "reference-only",
    });
    for (let index = 0; index < issueKinds.length; index += 1) {
      const itemId = unresolvedItemIds[index];
      const kind = issueKinds[index];
      if (itemId === undefined || kind === undefined) continue;
      unresolvedItems.push(
        await createExtractionUnresolvedItem(
          itemId,
          kind,
          candidate.value,
          segment,
          effective,
          adoption,
          openedAt.value,
        ),
      );
    }
  }

  return {
    ok: true,
    value: Object.freeze({
      candidates: Object.freeze(candidates),
      unresolvedItems: Object.freeze(unresolvedItems),
      authorityContexts: Object.freeze(authorityContexts),
    }),
  };
}

export function extractEffectiveDate(
  text: string,
  metadata: PassiveExtraction["metadata"] = {},
): ExtractedDate {
  return extractDate(text, metadata, "effective");
}

export function extractAdoptionDate(
  text: string,
  metadata: PassiveExtraction["metadata"] = {},
): ExtractedDate {
  return extractDate(text, metadata, "adopt(?:ed|ion)|execut(?:ed|ion)|signed");
}

export function normalizeRestatement(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export async function extractProvisionCandidate(
  input: CandidateExtractionInput,
): Promise<Result<ProvisionCandidate, string>> {
  const artifactSha256 = parseSha256(input.artifactSha256);
  if (!artifactSha256.ok)
    return { ok: false, error: artifactSha256.error.message };
  if (input.verbatimText.length === 0)
    return { ok: false, error: "Verbatim text must not be empty" };
  if (input.normalizedRestatement.trim().length === 0)
    return { ok: false, error: "Normalized restatement must not be empty" };
  if (input.confidence < 0 || input.confidence > 1)
    return { ok: false, error: "Confidence must be between 0 and 1" };
  if (
    input.status === "unresolved" &&
    (input.linkedUnresolvedItemIds?.length ?? 0) === 0
  )
    return { ok: false, error: "Unresolved candidates require an item link" };

  const deterministicPayload = {
    artifactSha256: artifactSha256.value,
    artifactLocator: input.artifactLocator,
    provisionIdentifier: input.provisionIdentifier,
    verbatimText: input.verbatimText,
    normalizedRestatement: input.normalizedRestatement,
    extractedEffectiveDate: input.extractedEffectiveDate,
    extractedAdoptionDate: input.extractedAdoptionDate,
    dateExtractionConvention: input.dateExtractionConvention,
    confidence: input.confidence,
    classifierId: input.classifierId,
    classifierVersion: input.classifierVersion,
    ruleSetVersion: input.ruleSetVersion,
    status: input.status ?? ("proposed" as const),
    ...(input.linkedUnresolvedItemIds === undefined
      ? {}
      : { linkedUnresolvedItemIds: input.linkedUnresolvedItemIds }),
  };
  const hash = await hashTyped(deterministicPayload, {
    schemaId: "provision-candidate.schema.json",
    typeName: "ProvisionCandidateContent",
  });
  const candidateContentSha256 = parseSha256(hash);
  if (!candidateContentSha256.ok)
    return { ok: false, error: candidateContentSha256.error.message };
  const candidateId = deterministicUuid(hash);

  return {
    ok: true,
    value: {
      candidateId,
      ...deterministicPayload,
      candidateContentSha256: candidateContentSha256.value,
    },
  };
}

function extractSegments(output: PassiveExtraction): readonly Segment[] {
  const segments =
    output.parserId === "pdf-passive"
      ? pdfSegments(output.rawValues)
      : output.parserId === "json-passive"
        ? jsonSegments(output.rawValues[0])
        : output.parserId === "workbook-passive"
          ? workbookSegments(output.rawValues)
          : output.parserId === "delimited-passive"
            ? delimitedSegments(output.rawValues)
            : textSegments(output.text, output.mediaType);
  return segments.flatMap(splitFormulaAndExample);
}

function pdfSegments(values: readonly unknown[]): readonly Segment[] {
  return values.flatMap((value) =>
    isPdfTextSpan(value) && value.verbatimText.length > 0
      ? [
          {
            locator: `pdf:page=${String(value.pageNumber)}:offset=${String(value.startOffset)}:endOffset=${String(value.endOffset)}`,
            text: value.verbatimText,
            provisionIdentifier: `pdf-page-${String(value.pageNumber)}-offset-${String(value.startOffset)}`,
            kind: detectSegmentKind(value.verbatimText),
          } as const,
        ]
      : [],
  );
}

function isPdfTextSpan(value: unknown): value is PdfTextSpan {
  if (typeof value !== "object" || value === null) return false;
  const span = value as Partial<PdfTextSpan>;
  return (
    span.kind === "pdf-text-span" &&
    Number.isInteger(span.pageNumber) &&
    (span.pageNumber ?? 0) >= 1 &&
    Number.isInteger(span.startOffset) &&
    (span.startOffset ?? -1) >= 0 &&
    Number.isInteger(span.endOffset) &&
    typeof span.verbatimText === "string" &&
    span.endOffset === (span.startOffset ?? 0) + span.verbatimText.length
  );
}

function splitFormulaAndExample(segment: Segment): readonly Segment[] {
  const example = /\b(?:example|illustration)\s*:/iu.exec(segment.text);
  if (example?.index === undefined || example.index === 0) return [segment];
  const formulaText = segment.text.slice(0, example.index);
  if (!/\bformula\b|=|\bmultiplied by\b|\btimes\b/iu.test(formulaText))
    return [segment];
  return [
    {
      ...segment,
      locator: `${segment.locator}:formula-offset=0`,
      provisionIdentifier: `${segment.provisionIdentifier}-formula`,
      text: formulaText,
      kind: "formula",
    },
    {
      ...segment,
      locator: `${segment.locator}:example-offset=${String(example.index)}`,
      provisionIdentifier: `${segment.provisionIdentifier}-example`,
      text: segment.text.slice(example.index),
      kind: "example",
    },
  ];
}

function textSegments(text: string, mediaType: string): readonly Segment[] {
  const segments: Segment[] = [];
  let line = 1;
  let start = 0;
  for (const match of text.matchAll(/.*(?:\r\n|\r|\n|$)/gu)) {
    const raw = match[0];
    const value = raw.replace(/(?:\r\n|\r|\n)$/u, "");
    if (value.trim().length > 0) {
      const prefix = mediaType === "application/pdf" ? "pdf" : "text";
      segments.push({
        locator: `${prefix}:line=${String(line)}:offset=${String(start)}`,
        text: value,
        provisionIdentifier: `${prefix}-line-${String(line)}`,
        kind: detectSegmentKind(value),
      });
    }
    start += raw.length;
    line += 1;
    if (raw.length === 0) break;
  }
  return segments;
}

function jsonSegments(value: unknown): readonly Segment[] {
  const segments: Segment[] = [];
  const visit = (current: unknown, pointer: string): void => {
    if (typeof current === "string" && current.length > 0) {
      segments.push({
        locator: pointer || "/",
        text: current,
        provisionIdentifier: pointer || "/",
        kind: detectSegmentKind(current),
      });
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((entry, index) => {
        visit(entry, `${pointer}/${String(index)}`);
      });
      return;
    }
    if (typeof current === "object" && current !== null) {
      for (const key of Object.keys(current).sort()) {
        const escaped = key.replaceAll("~", "~0").replaceAll("/", "~1");
        visit(
          (current as Record<string, unknown>)[key],
          `${pointer}/${escaped}`,
        );
      }
    }
  };
  visit(value, "");
  return segments;
}

function delimitedSegments(rows: readonly unknown[]): readonly Segment[] {
  return rows.flatMap((row, rowIndex) =>
    Array.isArray(row)
      ? row.flatMap((cell, columnIndex) =>
          typeof cell === "string" && cell.length > 0
            ? [
                {
                  locator: `row=${String(rowIndex + 1)}:column=${String(columnIndex + 1)}`,
                  text: cell,
                  provisionIdentifier: `row-${String(rowIndex + 1)}-column-${String(columnIndex + 1)}`,
                  kind: detectSegmentKind(cell),
                } as const,
              ]
            : [],
        )
      : [],
  );
}

function workbookSegments(values: readonly unknown[]): readonly Segment[] {
  return values.flatMap((value) => {
    if (!isWorkbookCell(value)) return [];
    const base = `sheet=${encodeURIComponent(value.sheet)}:cell=${value.address}`;
    const segments: Segment[] = [];
    if (typeof value.formulaText === "string" && value.formulaText.length > 0) {
      segments.push({
        locator: `${base}:formula`,
        text: value.formulaText,
        provisionIdentifier: `${value.sheet}!${value.address}-formula`,
        kind: "formula",
      });
    }
    const storedText = scalarText(value.storedValue);
    if (storedText !== null && storedText.length > 0) {
      segments.push({
        locator: `${base}:stored-value`,
        text: storedText,
        provisionIdentifier: `${value.sheet}!${value.address}-stored-value`,
        kind:
          value.formulaText === null
            ? detectSegmentKind(storedText)
            : "example",
      });
    }
    return segments;
  });
}

function scalarText(value: unknown): string | null {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : null;
}

function isWorkbookCell(value: unknown): value is WorkbookCellObservation {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { sheet?: unknown }).sheet === "string" &&
    typeof (value as { address?: unknown }).address === "string"
  );
}

function extractDate(
  text: string,
  metadata: PassiveExtraction["metadata"],
  labelPattern: string,
): ExtractedDate {
  const explicitPattern = new RegExp(
    `(?:${labelPattern})(?:\\s+date)?\\s*(?:is|:|of|on)?\\s*(${dateToken})`,
    "giu",
  );
  const explicit = uniqueValidDates(
    [...text.matchAll(explicitPattern)].map((match) => match[1] ?? ""),
  );
  if (explicit.length === 1)
    return {
      value: explicit[0] ?? null,
      convention: "explicit",
      ambiguousValues: [],
    };
  if (explicit.length > 1)
    return { value: null, convention: "unknown", ambiguousValues: explicit };

  const metadataValues = Object.entries(metadata)
    .filter(([key]) => new RegExp(labelPattern, "iu").test(key))
    .flatMap(([, value]) => (typeof value === "string" ? [value] : []));
  const inferred = uniqueValidDates(metadataValues);
  return inferred.length === 1
    ? {
        value: inferred[0] ?? null,
        convention: "inferred-from-context",
        ambiguousValues: [],
      }
    : {
        value: null,
        convention: "unknown",
        ambiguousValues: inferred.length > 1 ? inferred : [],
      };
}

const dateToken =
  "(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\/\\d{1,2}\\/\\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},\\s+\\d{4})";

function uniqueValidDates(values: readonly string[]): readonly string[] {
  return [
    ...new Set(
      values
        .map(normalizeDate)
        .filter((value): value is string => value !== null),
    ),
  ].sort();
}

function normalizeDate(value: string): string | null {
  const trimmed = value.trim();
  let year: number;
  let month: number;
  let day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(trimmed);
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u.exec(trimmed);
  const named =
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})$/iu.exec(
      trimmed,
    );
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (slash) {
    year = Number(slash[3]);
    month = Number(slash[1]);
    day = Number(slash[2]);
  } else if (named) {
    year = Number(named[3]);
    month = monthNames.indexOf((named[1] ?? "").toLowerCase()) + 1;
    day = Number(named[2]);
  } else return null;
  const normalized = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : null;
}

const monthNames = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function issueKindsFor(
  segment: Segment,
  effective: ExtractedDate,
  adoption: ExtractedDate,
): readonly ("ambiguous-text" | "undefined-term" | "other")[] {
  const kinds: ("ambiguous-text" | "undefined-term" | "other")[] = [];
  if (/\bmay\b|\bat the discretion of\b/iu.test(segment.text))
    kinds.push("ambiguous-text");
  if (/\bundefined term\b|\bnot defined\b/iu.test(segment.text))
    kinds.push("undefined-term");
  if (
    segment.kind === "example" ||
    (segment.kind === "formula" &&
      /\b(?:example|illustration)\b/iu.test(segment.text))
  )
    kinds.push("other");
  if (
    effective.ambiguousValues.length > 1 ||
    adoption.ambiguousValues.length > 1
  )
    kinds.push("ambiguous-text");
  if (
    effective.convention === "inferred-from-context" ||
    adoption.convention === "inferred-from-context"
  )
    kinds.push("ambiguous-text");
  return [...new Set(kinds)];
}

function detectSegmentKind(text: string): Segment["kind"] {
  if (/\b(?:example|illustration|for instance)\b/iu.test(text))
    return "example";
  if (/\bformula\b|=|\bmultiplied by\b|\btimes\b/iu.test(text))
    return "formula";
  return "provision";
}

function confidenceFor(
  segment: Segment,
  effective: ExtractedDate,
  adoption: ExtractedDate,
  issues: readonly string[],
): number {
  let score = 0.6;
  if (segment.provisionIdentifier.length > 0) score += 0.1;
  if (effective.convention === "explicit") score += 0.1;
  if (adoption.convention === "explicit") score += 0.05;
  if (segment.kind === "example") score -= 0.2;
  score -= issues.length * 0.1;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function combineDateConventions(
  left: ExtractedDate["convention"],
  right: ExtractedDate["convention"],
): ExtractedDate["convention"] {
  if (left === "inferred-from-context" || right === "inferred-from-context")
    return "inferred-from-context";
  if (left === "explicit" || right === "explicit") return "explicit";
  return "unknown";
}

async function createExtractionUnresolvedItem(
  itemId: Uuid,
  kind: "ambiguous-text" | "undefined-term" | "other",
  candidate: ProvisionCandidate,
  segment: Segment,
  effective: ExtractedDate,
  adoption: ExtractedDate,
  openAt: UtcTimestamp,
): Promise<UnresolvedItem> {
  const statements = unresolvedStatements(kind, segment, effective, adoption);
  const competingInterpretations = await Promise.all(
    statements.map(async (statement, index) => ({
      interpretationId: deterministicUuid(
        await hashTyped(
          { itemId, statement, index },
          { typeName: "ExtractionInterpretationIdentity" },
        ),
      ),
      statement,
      evidence: [],
      sourceCandidateId: candidate.candidateId,
    })),
  );
  const created = await createUnresolvedItem(
    {
      kind,
      affectedScope: `${candidate.artifactSha256}:${candidate.artifactLocator}`,
      competingInterpretations,
      consequence:
        kind === "other"
          ? "A reviewer must identify whether the formula text or numeric example governs."
          : "A reviewer must resolve the source language before it governs a calculation.",
      reviewer: null,
    },
    { uuid: () => itemId, now: () => openAt },
  );
  if (!created.ok) throw new Error(created.error);
  return created.value;
}

function unresolvedStatements(
  kind: "ambiguous-text" | "undefined-term" | "other",
  segment: Segment,
  effective: ExtractedDate,
  adoption: ExtractedDate,
): readonly [string, string] {
  if (kind === "other")
    return [
      "The formula text governs and the numeric value is illustrative only.",
      "The numeric example may constrain or conflict with the stated formula.",
    ];
  const ambiguousDates = [
    ...effective.ambiguousValues,
    ...adoption.ambiguousValues,
  ];
  if (ambiguousDates.length > 1)
    return [
      `The first stated date (${ambiguousDates[0] ?? "unknown"}) governs this provision.`,
      `A different stated date (${ambiguousDates[1] ?? "unknown"}) governs this provision.`,
    ];
  if (
    effective.convention === "inferred-from-context" ||
    adoption.convention === "inferred-from-context"
  )
    return [
      "The contextual date applies to this provision.",
      "The contextual date does not apply without explicit provision-level language.",
    ];
  if (kind === "undefined-term")
    return [
      "The undefined term has a plan-specific meaning requiring cited evidence.",
      "The undefined term cannot be applied until its meaning is established.",
    ];
  return [
    `The discretionary language in ${segment.provisionIdentifier} creates an entitlement.`,
    `The discretionary language in ${segment.provisionIdentifier} does not create an entitlement without further action.`,
  ];
}

function deterministicUuid(hash: string): Uuid {
  const value = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const parsed = parseUuid(value);
  if (!parsed.ok) throw new Error("Deterministic UUID generation failed.");
  return parsed.value;
}

function failure(
  code: ExtractionError["code"],
  message: string,
): Result<never, ExtractionError> {
  return { ok: false, error: { code, message } };
}

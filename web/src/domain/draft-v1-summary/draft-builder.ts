import { hashTyped } from "../manifests/canonical-json";
import { parseSha256 } from "../shared/types";
import {
  APPROVED_V1_REFERENCE_CORPUS_PATH,
  APPROVED_V1_REFERENCE_INDEX_VERSION,
  approvedV1SummaryReferences,
} from "./reference-index";
import type {
  ApprovedV1SummaryReference,
  DraftV1SummaryArtifact,
  DraftV1SummaryInput,
  DraftV1SummaryMatch,
  DraftV1SummarySelectedScaffold,
  DraftV1SummarySignalProfile,
} from "./models";

const MAX_PROFILE_VALUES = 250;
const MAX_PROFILE_TOKENS = 500;
const MAX_CANDIDATE_MATCHES = 5;
const MAX_TRAVERSAL_DEPTH = 12;
const MAX_TRAVERSAL_NODES = 50_000;
const FIELD_PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/u;

interface NormalizationState {
  readonly sourceTabs: Set<string>;
  readonly sourceTabKeys: Set<string>;
  readonly runs: Set<string>;
  readonly genericFields: Set<string>;
  readonly tokens: Set<string>;
  readonly warnings: Set<string>;
  readonly numericSignals: {
    cellCount: number | null;
    formulaCellCount: number | null;
  };
  nodeCount: number;
}

interface MatchCandidate extends DraftV1SummaryMatch {
  readonly reference: ApprovedV1SummaryReference;
}

export function normalizeR5Summary(
  value: unknown,
): DraftV1SummarySignalProfile {
  const state: NormalizationState = {
    sourceTabs: new Set(),
    sourceTabKeys: new Set(),
    runs: new Set(),
    genericFields: new Set(),
    tokens: new Set(),
    warnings: new Set(),
    numericSignals: {
      cellCount: null,
      formulaCellCount: null,
    },
    nodeCount: 0,
  };

  visit(value, [], state, 0);

  return deepFreeze({
    schemaVersion: "1.0.0",
    sourceKind: "r5-summary",
    sourceTabs: sortedLimited(state.sourceTabs, MAX_PROFILE_VALUES),
    runs: sortedLimited(state.runs, MAX_PROFILE_VALUES),
    genericFields: sortedLimited(state.genericFields, MAX_PROFILE_VALUES),
    tokens: sortedLimited(state.tokens, MAX_PROFILE_TOKENS),
    comparableSignalCounts: {
      sourceTabs: state.sourceTabs.size,
      runs: state.runs.size,
      genericFields: state.genericFields.size,
      tokens: state.tokens.size,
    },
    numericSignals: { ...state.numericSignals },
    normalizationWarnings: [...state.warnings].sort(),
  });
}

export function matchApprovedV1SummaryReferences(
  profile: DraftV1SummarySignalProfile,
  references: readonly ApprovedV1SummaryReference[] = approvedV1SummaryReferences,
): readonly DraftV1SummaryMatch[] {
  return scoreReferences(profile, references)
    .slice(0, MAX_CANDIDATE_MATCHES)
    .map(publicMatch);
}

export async function createDraftV1SummaryArtifact(
  input: DraftV1SummaryInput,
): Promise<DraftV1SummaryArtifact> {
  const references = input.references ?? approvedV1SummaryReferences;
  if (references.length === 0) {
    throw new Error("No approved V1 summary references are available.");
  }
  const normalizedR5Signals = normalizeR5Summary(input.r5Summary);
  const matches = scoreReferences(normalizedR5Signals, references).slice(
    0,
    MAX_CANDIDATE_MATCHES,
  );
  const selected = matches[0];
  if (selected === undefined) {
    throw new Error("No approved V1 summary references could be scored.");
  }

  const selectedScaffold = selectedScaffoldFromMatch(selected);
  const blockers = blockersFor(normalizedR5Signals, selected);
  const deterministicPayload = deepFreeze({
    schemaVersion: "1.0.0" as const,
    caseId: input.caseId,
    artifactPurpose: "pre-package-v1-summary-scaffold" as const,
    draftStatus: "blocked" as const,
    r5Source: {
      fileName: input.r5SummaryFileName,
      contentSha256: input.r5SummaryContentSha256,
      schemaName: "r5-summary.schema.json" as const,
      schemaStrictness: "open-additional-properties" as const,
    },
    referenceCorpus: {
      corpusPath: APPROVED_V1_REFERENCE_CORPUS_PATH,
      indexVersion: APPROVED_V1_REFERENCE_INDEX_VERSION,
      referenceCount: references.length,
    },
    normalizedR5Signals,
    selectedScaffold,
    candidateMatches: matches.map(publicMatch),
    draftSummary: {
      schemaVersion: "draft-v1-summary-1.0" as const,
      draftStatus: "blocked" as const,
      keyMode: selected.reference.keyMode,
      workbookName: `draft-${selected.reference.workbookName}`,
      sourceTabs: [...selected.reference.sourceTabs],
      runs: [...selected.reference.runs],
      cellCount: selected.reference.cellCount,
      uniqueFieldCount: selected.reference.uniqueFieldCount,
      formulaCellCount: selected.reference.formulaCellCount,
      fieldPreview: selected.reference.genericFields.slice(0, 50),
      omittedCellsReason:
        "Draft artifact preserves scaffold selection metadata only; full cell mappings require governed plan rules, population profile, BuildSpec controls, formula compilation, and human review.",
    },
    blockers,
    maturityClaims: [
      {
        subject: "draft-v1-summary",
        level: "specified" as const,
        evidence:
          "The artifact records deterministic R5 signal normalization and closest approved-reference scaffold matching only.",
        externalExecutionClaimed: false as const,
      },
    ],
    lineage: [
      {
        fromArtifactSha256: input.r5SummaryContentSha256,
        toArtifactSha256: selected.reference.contentSha256,
        relationship: "compared-with-approved-reference-scaffold",
      },
    ],
  });

  const parsedHash = parseSha256(
    await hashTyped(deterministicPayload, {
      typeName: "DraftV1SummaryArtifact",
    }),
  );
  if (!parsedHash.ok) throw new Error(parsedHash.error.message);

  return deepFreeze({
    schemaVersion: "1.0.0" as const,
    artifactType: "draft-v1-summary" as const,
    deterministicPayload,
    contentSha256: parsedHash.value,
    operationalMetadata: {
      generatedAt: input.generatedAt,
      generatedBy: input.generatedBy,
      generatorVersion: "draft-v1-summary-generator-v1.0.0" as const,
    },
  });
}

function publicMatch(match: MatchCandidate): DraftV1SummaryMatch {
  return deepFreeze({
    referenceId: match.referenceId,
    fileName: match.fileName,
    workbookName: match.workbookName,
    referenceContentSha256: match.referenceContentSha256,
    scoreBasisPoints: match.scoreBasisPoints,
    matchedFieldCount: match.matchedFieldCount,
    matchedRunCount: match.matchedRunCount,
    matchedSourceTabCount: match.matchedSourceTabCount,
    cellCountDistance: match.cellCountDistance,
  });
}

function visit(
  value: unknown,
  path: readonly string[],
  state: NormalizationState,
  depth: number,
): void {
  if (depth > MAX_TRAVERSAL_DEPTH) {
    state.warnings.add(
      "R5 traversal depth limit reached; deeper values ignored.",
    );
    return;
  }
  state.nodeCount += 1;
  if (state.nodeCount > MAX_TRAVERSAL_NODES) {
    state.warnings.add(
      "R5 traversal node limit reached; remaining values ignored.",
    );
    return;
  }

  const context = path.at(-1) ?? "";
  if (typeof value === "string") {
    captureString(context, value, state);
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    captureNumber(context, value, state);
    return;
  }
  if (value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    captureCollectionSize(context, value.length, state);
    for (const item of value) visit(item, path, state, depth + 1);
    return;
  }

  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    captureKey(key, child, state);
    captureCollectionSize(key, collectionSize(child), state);
    visit(child, [...path, key], state, depth + 1);
  }
}

function captureKey(
  key: string,
  child: unknown,
  state: NormalizationState,
): void {
  addTokens(key, state);
  const field = normalizeFieldKey(key);
  if (field !== null) state.genericFields.add(field);

  const normalizedKey = normalizeKey(key);
  if (isFieldKey(normalizedKey))
    captureStringValues(child, state.genericFields);
  if (isRunKey(normalizedKey))
    captureStringValues(child, state.runs, normalizeRun);
  if (isTabKey(normalizedKey)) {
    const before = state.sourceTabs.size;
    captureStringValues(child, state.sourceTabs, normalizeLabel);
    if (state.sourceTabs.size > before) state.sourceTabKeys.add(normalizedKey);
  }
}

function captureString(
  context: string,
  value: string,
  state: NormalizationState,
): void {
  const normalizedKey = normalizeKey(context);
  addTokens(value, state);
  if (isFieldKey(normalizedKey)) {
    captureStringValues(value, state.genericFields);
  } else if (isRunKey(normalizedKey)) {
    captureStringValues(value, state.runs, normalizeRun);
  } else if (isTabKey(normalizedKey)) {
    captureStringValues(value, state.sourceTabs, normalizeLabel);
  }
  const field = normalizeField(value);
  if (field !== null) state.genericFields.add(field);
}

function captureNumber(
  context: string,
  value: number,
  state: NormalizationState,
): void {
  if (!Number.isInteger(value) || value < 0) return;
  const normalizedKey = normalizeKey(context);
  if (normalizedKey.includes("formulacellcount")) {
    state.numericSignals.formulaCellCount = value;
  } else if (normalizedKey.includes("cellcount")) {
    state.numericSignals.cellCount = value;
  }
}

function captureCollectionSize(
  key: string,
  size: number | null,
  state: NormalizationState,
): void {
  if (size === null) return;
  const normalizedKey = normalizeKey(key);
  if (normalizedKey === "cells" || normalizedKey.endsWith("cells")) {
    state.numericSignals.cellCount ??= size;
  }
}

function captureStringValues(
  value: unknown,
  target: Set<string>,
  normalize: (value: string) => string | null = normalizeField,
): void {
  if (typeof value === "string") {
    const normalized = normalize(value);
    if (normalized !== null) target.add(normalized);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) captureStringValues(item, target, normalize);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      captureStringValues(child, target, normalize);
    }
  }
}

function addTokens(value: string, state: NormalizationState): void {
  for (const token of value.toUpperCase().split(/[^A-Z0-9_]+/u)) {
    if (token.length >= 2 && token.length <= 40 && !/^\d+$/u.test(token)) {
      state.tokens.add(token);
    }
  }
}

function scoreReferences(
  profile: DraftV1SummarySignalProfile,
  references: readonly ApprovedV1SummaryReference[],
): readonly MatchCandidate[] {
  const inputFields = new Set(profile.genericFields);
  const inputRuns = new Set(profile.runs.map(normalizeRun).filter(isString));
  const inputTabs = new Set(
    profile.sourceTabs.map(normalizeLabel).filter(isString),
  );

  return references
    .map((reference) => {
      const referenceFields = new Set(reference.genericFields);
      const matchedFieldCount = intersectionSize(inputFields, referenceFields);
      const matchedRunCount = intersectionSize(
        inputRuns,
        new Set(reference.runs.map(normalizeRun).filter(isString)),
      );
      const matchedSourceTabCount = intersectionSize(
        inputTabs,
        new Set(reference.sourceTabs.map(normalizeLabel).filter(isString)),
      );
      const fieldScore = coverageScore(
        matchedFieldCount,
        inputFields.size,
        6_500,
      );
      const runScore = coverageScore(matchedRunCount, inputRuns.size, 1_500);
      const tabScore = coverageScore(
        matchedSourceTabCount,
        inputTabs.size,
        1_000,
      );
      const cellScore = numericSimilarityScore(
        profile.numericSignals.cellCount,
        reference.cellCount,
        700,
      );
      const formulaScore = numericSimilarityScore(
        profile.numericSignals.formulaCellCount,
        reference.formulaCellCount,
        300,
      );
      const scoreBasisPoints = Math.min(
        10_000,
        fieldScore + runScore + tabScore + cellScore + formulaScore,
      );
      return {
        reference,
        referenceId: reference.referenceId,
        fileName: reference.fileName,
        workbookName: reference.workbookName,
        referenceContentSha256: reference.contentSha256,
        scoreBasisPoints,
        matchedFieldCount,
        matchedRunCount,
        matchedSourceTabCount,
        cellCountDistance:
          profile.numericSignals.cellCount === null
            ? null
            : Math.abs(profile.numericSignals.cellCount - reference.cellCount),
      };
    })
    .sort(compareMatches);
}

function selectedScaffoldFromMatch(
  match: MatchCandidate,
): DraftV1SummarySelectedScaffold {
  return deepFreeze({
    referenceId: match.reference.referenceId,
    fileName: match.reference.fileName,
    workbookName: match.reference.workbookName,
    referenceContentSha256: match.reference.contentSha256,
    schemaVersion: match.reference.schemaVersion,
    keyMode: match.reference.keyMode,
    sourceTabs: [...match.reference.sourceTabs],
    runs: [...match.reference.runs],
    cellCount: match.reference.cellCount,
    uniqueFieldCount: match.reference.uniqueFieldCount,
    formulaCellCount: match.reference.formulaCellCount,
    iobCounts: { ...match.reference.iobCounts },
    matchedFieldCount: match.matchedFieldCount,
    matchedRunCount: match.matchedRunCount,
    matchedSourceTabCount: match.matchedSourceTabCount,
  });
}

function blockersFor(
  profile: DraftV1SummarySignalProfile,
  selected: MatchCandidate,
): readonly string[] {
  const blockers = [
    "Draft V1 summary is a scaffold-selection artifact only; it is not a governed V1 architecture, BuildSpec 2.0.0 artifact, compiled formula artifact, workbook, validation result, reconciliation result, or human-approved case deliverable.",
    "Selected approved-reference summary is not canonical authority for this case until a human approval record ties the exact reference hash to a permitted purpose.",
    "R5 summary matching does not supply effective-dated plan-rule evidence, population-profile approval, case controls, missing-data resolution, formula compilation, or external execution evidence.",
  ];
  if (
    profile.comparableSignalCounts.genericFields === 0 &&
    profile.comparableSignalCounts.runs === 0 &&
    profile.comparableSignalCounts.sourceTabs === 0
  ) {
    blockers.push(
      "R5 summary normalization found no comparable fields, runs, or source tabs; the selected scaffold is a deterministic fallback.",
    );
  }
  if (selected.scoreBasisPoints < 2_500) {
    blockers.push(
      "Closest approved-reference scaffold score is below 25%; review the R5 source and reference candidate before any downstream use.",
    );
  }
  return Object.freeze(blockers);
}

function compareMatches(left: MatchCandidate, right: MatchCandidate): number {
  return (
    right.scoreBasisPoints - left.scoreBasisPoints ||
    right.matchedFieldCount - left.matchedFieldCount ||
    right.matchedRunCount - left.matchedRunCount ||
    right.matchedSourceTabCount - left.matchedSourceTabCount ||
    left.reference.cellCount - right.reference.cellCount ||
    left.fileName.localeCompare(right.fileName)
  );
}

function coverageScore(
  matchedCount: number,
  inputCount: number,
  weight: number,
): number {
  if (inputCount === 0) return 0;
  return Math.round((matchedCount / inputCount) * weight);
}

function numericSimilarityScore(
  input: number | null,
  reference: number,
  weight: number,
): number {
  if (input === null || input === 0 || reference === 0) return 0;
  const distance = Math.abs(input - reference);
  const denominator = Math.max(input, reference);
  return Math.round(Math.max(0, 1 - distance / denominator) * weight);
}

function intersectionSize(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  let count = 0;
  for (const item of left) {
    if (right.has(item)) count += 1;
  }
  return count;
}

function sortedLimited(
  values: ReadonlySet<string>,
  limit: number,
): readonly string[] {
  return [...values].sort().slice(0, limit);
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function normalizeField(value: string): string | null {
  const trimmed = value.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{1,39}$/u.test(trimmed)) return null;
  const normalized = trimmed.toUpperCase();
  return FIELD_PATTERN.test(normalized) ? normalized : null;
}

function normalizeFieldKey(value: string): string | null {
  const trimmed = value.trim();
  if (/^[A-Z]{1,3}[1-9][0-9]{0,6}$/u.test(trimmed)) return null;
  return /^[A-Z][A-Z0-9_]{1,39}$/u.test(trimmed) ? trimmed : null;
}

function normalizeRun(value: string): string | null {
  const normalized = value.trim().toUpperCase().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= 40 ? normalized : null;
}

function normalizeLabel(value: string): string | null {
  const normalized = value.trim().toUpperCase().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= 80 ? normalized : null;
}

function isFieldKey(normalizedKey: string): boolean {
  return (
    normalizedKey.includes("field") ||
    normalizedKey.includes("column") ||
    normalizedKey.includes("genericfield")
  );
}

function isRunKey(normalizedKey: string): boolean {
  return (
    normalizedKey.includes("run") ||
    normalizedKey.includes("calculation") ||
    normalizedKey.includes("scenario")
  );
}

function isTabKey(normalizedKey: string): boolean {
  return normalizedKey.includes("tab") || normalizedKey.includes("sheet");
}

function collectionSize(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === "object")
    return Object.keys(value).length;
  return null;
}

function isString(value: string | null): value is string {
  return value !== null;
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

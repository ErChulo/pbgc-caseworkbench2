import { parseCanonicalDecimalString } from "../shared/types";

export interface CanonicalContext {
  readonly schemaId?: string;
  readonly typeName?: string;
}

export interface CanonicalIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface CanonicalValidation {
  readonly valid: boolean;
  readonly issues: readonly CanonicalIssue[];
}

type ArrayKind = "set" | "ordered" | "ascending-priority";

interface ArrayRule {
  readonly kind: ArrayKind;
  readonly normalizeStrings?: "trim-nfc";
  readonly keys?: readonly string[];
  readonly duplicateKey?: string | readonly string[];
  readonly caseFold?: boolean;
}

const canonicalDecimalPattern =
  /^(?!-0$)-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u;

const registeredRules: Readonly<Record<string, ArrayRule>> = {
  "deidentified-export.schema.json:sourceArtifactSha256Values": set(),
  "deidentified-export.schema.json:allowedOutputFields": stringSet(),
  "deidentified-export.schema.json:removedDirectIdentifiers": stringSet(),
  "deidentified-export.schema.json:removedIndirectIdentifiers": stringSet(),
  "deidentified-export.schema.json:transformedOrGeneralizedFields": set(
    ["outputField", "sourceField", "method", "ruleVersion"],
    "outputField",
  ),
  "deidentified-export.schema.json:retainedGeneralizedQuasiFields": set(
    ["fieldName"],
    "fieldName",
  ),
  "deidentified-export.schema.json:residualRiskStatements": ordered(),
  "deidentified-export.schema.json:limitationStatements": ordered(),
  "deidentified-export.schema.json:validationFindings": set(
    ["validationKey"],
    "validationKey",
  ),
  "deidentified-export.schema.json:records": ordered(),
  "evidence-acquisition.schema.json:deterministicRequestPayload.missingFacts":
    set(["factKey", "description"], "factKey"),
  "evidence-acquisition.schema.json:deterministicRequestPayload.candidateDocumentOrReportTypes":
    stringSet(),
  "evidence-acquisition.schema.json:deterministicRequestPayload.sourcePriorityRecommendations":
    { kind: "ascending-priority" },
  "evidence-acquisition.schema.json:deterministicPackagePayload.artifactSha256Values":
    set(),
  "evidence-acquisition.schema.json:deterministicProposalPayload.artifactSha256Values":
    set(),
  "evidence-acquisition.schema.json:deterministicProposalPayload.sourceCitations":
    set(["citationId", "artifactSha256", "sourceLocator"], "citationId"),
  "evidence-acquisition.schema.json:deterministicProposalPayload.uncertainties":
    ordered(),
  "evidence-acquisition.schema.json:deterministicProposalPayload.conflicts":
    ordered(),
  "evidence-acquisition.schema.json:rerunTrigger.requiredInputHashes": set(),
  "evidence-acquisition.schema.json:extractionInstructionRegistration.prohibitedActivities":
    stringSet(),
  "evidence-manifest.schema.json:deterministicPayload.snapshot.entries": set(
    ["submittedPath", "sha256", "sizeBytes"],
    "submittedPath",
  ),
  "evidence-manifest.schema.json:deterministicPayload.artifacts": set(
    ["artifactKey", "sha256"],
    "artifactKey",
  ),
  "evidence-manifest.schema.json:deterministicPayload.containmentEdges":
    ordered(),
  "evidence-manifest.schema.json:deterministicPayload.failedMemberObservations":
    ordered(),
  "evidence-manifest.schema.json:deterministicPayload.extractionResults": set([
    "sourceArtifactSha256",
    "sourceLocator",
    "ruleVersion",
    "methodVersion",
  ]),
  "evidence-manifest.schema.json:deterministicPayload.screeningFindings": set(
    ["findingKey", "artifactSha256"],
    "findingKey",
  ),
  "evidence-manifest.schema.json:deterministicPayload.screeningOutcomes": set(
    ["outcomeKey", "artifactSha256"],
    "outcomeKey",
  ),
  "evidence-manifest.schema.json:deterministicPayload.classificationProposals":
    set(["proposalKey", "artifactSha256"], "proposalKey"),
  "evidence-manifest.schema.json:deterministicPayload.evidenceRelationships":
    set(["relationshipKey"], "relationshipKey"),
  "evidence-manifest.schema.json:deterministicPayload.populationEvidenceObservations":
    set(
      ["evidenceKey", "citationId", "artifactSha256", "sourceLocator"],
      ["evidenceKey", "citationId"],
    ),
  "evidence-manifest.schema.json:deterministicPayload.populationCandidates":
    set(["candidateKey", "artifactSha256"], "candidateKey"),
  "evidence-manifest.schema.json:deterministicPayload.populationCandidates[].evidence":
    set(["evidenceKey"], "evidenceKey"),
  "evidence-manifest.schema.json:deterministicPayload.unresolvedItems": set(
    ["itemKey"],
    "itemKey",
  ),
  "evidence-manifest.schema.json:deterministicPayload.validationResults": set(
    ["validationKey"],
    "validationKey",
  ),
  "evidence-manifest.schema.json:deterministicPayload.acquisitionPayloadReferences":
    set(
      ["requestPayloadSha256", "packagePayloadSha256", "proposalPayloadSha256"],
      ["requestPayloadSha256", "packagePayloadSha256", "proposalPayloadSha256"],
    ),
  "evidence-manifest.schema.json:deterministicPayload.acquisitionPayloadReferences[].artifactSha256Values":
    set(),
  "evidence-manifest.schema.json:reconciliationTotals.originLedger": set(
    ["recordId"],
    "recordId",
  ),
  "evidence-manifest.schema.json:reconciliationTotals.terminalDispositionLedger":
    set(["recordId"], "recordId"),
  "extraction-result.schema.json:observations": ordered(),
  "extraction-result.schema.json:limitations": stringSet(),
  "governed-records.schema.json:validationResult.evidence": ordered(),
  "governed-records.schema.json:validationResult.limitations": stringSet(),
  "governed-records.schema.json:screeningFinding.evidence": ordered(),
  "governed-records.schema.json:screeningFinding.limitations": stringSet(),
  "governed-records.schema.json:screeningOutcome.findingKeys": set(),
  "governed-records.schema.json:classificationProposal.supportingEvidence":
    ordered(),
  "governed-records.schema.json:evidenceRelationship.supportingEvidence":
    ordered(),
  "governed-records.schema.json:unresolvedItem.subjectKeys": set(),
  "governed-records.schema.json:unresolvedItem.evidence": ordered(),
  "governed-records.schema.json:unresolvedItem.competingPossibilities":
    ordered(),
  "normalized-evidence.schema.json:deterministicPayload.observations":
    ordered(),
  "normalized-evidence.schema.json:deterministicPayload.populationCandidate.evidence":
    set(["evidenceKey"], "evidenceKey"),
  "normalized-evidence.schema.json:deterministicPayload.populationCandidate.observedFields":
    ordered(),
  "normalized-evidence.schema.json:deterministicPayload.populationCandidate.recordCounts":
    ordered(),
  "normalized-evidence.schema.json:validationResults": set(
    ["validationKey"],
    "validationKey",
  ),
};

function set(
  keys: readonly string[] = [],
  duplicateKey?: string | readonly string[],
): ArrayRule {
  return { kind: "set", keys, duplicateKey };
}

function stringSet(): ArrayRule {
  return {
    kind: "set",
    normalizeStrings: "trim-nfc",
    caseFold: true,
  };
}

function ordered(): ArrayRule {
  return { kind: "ordered" };
}

class CanonicalizationError extends TypeError {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(`${code} at ${path || "<root>"}: ${message}`);
    this.name = "CanonicalizationError";
    this.code = code;
    this.path = path;
  }
}

interface State {
  readonly context: CanonicalContext;
  readonly ancestors: Set<object>;
}

export function canonicalize(value: unknown): string {
  return serialize(value, "", { context: {}, ancestors: new Set() });
}

export function canonicalizeTyped(
  value: unknown,
  context: CanonicalContext,
): string {
  return serialize(value, "", { context, ancestors: new Set() });
}

export async function hashTyped(
  value: unknown,
  context: CanonicalContext,
): Promise<string> {
  const root = deterministicHashRoot(value);
  const bytes = new TextEncoder().encode(
    serialize(root.value, root.path, {
      context,
      ancestors: new Set(),
    }),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((octet) => octet.toString(16).padStart(2, "0"))
    .join("");
}

export function validateCanonicalDecimalString(value: string): boolean {
  return (
    canonicalDecimalPattern.test(value) && parseCanonicalDecimalString(value).ok
  );
}

export function validateSet(
  value: unknown,
  context: { readonly typeName: string },
): CanonicalValidation {
  try {
    if (
      context.typeName === "CandidateDocumentOrReportTypes" &&
      Array.isArray(value)
    ) {
      serializeArray(value, "", stringSet(), {
        context,
        ancestors: new Set(),
      });
    } else {
      canonicalizeTyped(value, context);
    }
    return { valid: true, issues: [] };
  } catch (error) {
    if (error instanceof CanonicalizationError) {
      return {
        valid: false,
        issues: [
          { code: error.code, path: error.path, message: error.message },
        ],
      };
    }
    throw error;
  }
}

function serialize(value: unknown, path: string, state: State): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    const normalized = normalizeUnicode(value, path);
    return JSON.stringify(normalized);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalizationError(
        "NON_FINITE_NUMBER",
        path,
        "NaN and infinities are not valid deterministic JSON numbers.",
      );
    }
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (
    typeof value === "undefined" ||
    typeof value === "bigint" ||
    typeof value === "symbol" ||
    typeof value === "function"
  ) {
    throw new CanonicalizationError(
      "INVALID_JSON_VALUE",
      path,
      `Unsupported deterministic value type: ${typeof value}.`,
    );
  }
  if (Array.isArray(value)) {
    const rule = findRule(path, state.context) ?? ordered();
    return serializeArray(value, path, rule, state);
  }
  if (typeof value === "object") return serializeObject(value, path, state);
  throw new CanonicalizationError(
    "INVALID_JSON_VALUE",
    path,
    "Value cannot be represented as deterministic JSON.",
  );
}

function serializeObject(value: object, path: string, state: State): string {
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new CanonicalizationError(
      "NON_PLAIN_OBJECT",
      path,
      "Only plain JSON objects are accepted.",
    );
  }
  enter(value, path, state);
  try {
    const record = value as Record<string, unknown>;
    const normalizedKeys = Object.keys(record).map((key) => ({
      original: key,
      normalized: normalizeUnicode(key, path),
    }));
    const distinct = new Set(
      normalizedKeys.map(({ normalized }) => normalized),
    );
    if (distinct.size !== normalizedKeys.length) {
      throw new CanonicalizationError(
        "INDISTINGUISHABLE_NORMALIZED_KEY",
        path,
        "Object keys must remain unique after Unicode NFC normalization.",
      );
    }
    normalizedKeys.sort((left, right) =>
      compareText(left.normalized, right.normalized),
    );
    return `{${normalizedKeys
      .map(({ original, normalized }) => {
        const child = record[original];
        if (child === undefined) {
          throw new CanonicalizationError(
            "UNDEFINED_PROPERTY",
            joinPath(path, normalized),
            "Absent properties must be omitted; present properties cannot be undefined.",
          );
        }
        return `${JSON.stringify(normalized)}:${serialize(
          child,
          joinPath(path, normalized),
          state,
        )}`;
      })
      .join(",")}}`;
  } finally {
    state.ancestors.delete(value);
  }
}

function serializeArray(
  value: readonly unknown[],
  path: string,
  rule: ArrayRule,
  state: State,
): string {
  enter(value, path, state);
  try {
    if (Object.keys(value).length !== value.length) {
      throw new CanonicalizationError(
        "SPARSE_ARRAY",
        path,
        "Sparse arrays are not valid deterministic content.",
      );
    }
    const items = value.map((item, index) => {
      if (item === undefined) {
        throw new CanonicalizationError(
          "INVALID_JSON_VALUE",
          `${path}[${String(index)}]`,
          "Array elements cannot be undefined.",
        );
      }
      const normalized =
        rule.normalizeStrings === "trim-nfc" && typeof item === "string"
          ? normalizeUnicode(item.trim(), `${path}[${String(index)}]`)
          : item;
      const bytes = serialize(normalized, `${path}[]`, state);
      return {
        value: normalized,
        bytes,
        keys: sortKeys(normalized, rule),
      };
    });

    if (rule.kind === "ascending-priority") {
      let previous = -Infinity;
      for (const [index, item] of items.entries()) {
        const priority = getField(item.value, "priority");
        if (
          typeof priority !== "number" ||
          !Number.isInteger(priority) ||
          priority <= previous
        ) {
          throw new CanonicalizationError(
            "INVALID_ARRAY_ORDER",
            `${path}[${String(index)}]`,
            "Source priorities must be unique integers in ascending order.",
          );
        }
        previous = priority;
      }
    } else if (rule.kind === "set") {
      rejectDuplicates(items, rule, path);
      items.sort((left, right) => {
        const keyResult = compareKeyLists(left.keys, right.keys);
        return keyResult === 0
          ? compareText(left.bytes, right.bytes)
          : keyResult;
      });
    }
    return `[${items.map(({ bytes }) => bytes).join(",")}]`;
  } finally {
    state.ancestors.delete(value);
  }
}

function findRule(
  path: string,
  context: CanonicalContext,
): ArrayRule | undefined {
  if (
    context.typeName === "PopulationCandidate" &&
    (path === "evidence" || path.endsWith(".populationCandidate.evidence"))
  ) {
    return set(["evidenceKey"], "evidenceKey");
  }
  return context.schemaId
    ? registeredRules[`${context.schemaId}:${path}`]
    : undefined;
}

function sortKeys(value: unknown, rule: ArrayRule): readonly string[] {
  if (typeof value === "string") {
    const normalized = normalizeUnicode(value, "<set-item>");
    return rule.caseFold
      ? [normalized.toLowerCase(), normalized]
      : [normalized];
  }
  return (rule.keys ?? []).map((key) => fieldSortValue(value, key));
}

function fieldSortValue(value: unknown, key: string): string {
  const field = getField(value, key);
  if (field === null) return "\u0000";
  if (typeof field === "string") {
    return normalizeUnicode(field, `<set-key:${key}>`);
  }
  if (typeof field === "number") {
    return `${field < 0 ? "-" : "+"}${Math.abs(field)
      .toString()
      .padStart(24, "0")}`;
  }
  if (typeof field === "boolean") return field ? "1" : "0";
  return "";
}

function rejectDuplicates(
  items: readonly {
    readonly value: unknown;
    readonly bytes: string;
    readonly keys: readonly string[];
  }[],
  rule: ArrayRule,
  path: string,
): void {
  const seenContent = new Set<string>();
  const seenIdentity = new Set<string>();
  for (const item of items) {
    const duplicateKeys =
      typeof rule.duplicateKey === "string"
        ? [rule.duplicateKey]
        : rule.duplicateKey;
    const identity = duplicateKeys
      ? duplicateKeys
          .map((key) => fieldSortValue(item.value, key))
          .join("\u001f")
      : item.keys.join("\u001f");
    if (duplicateKeys && identity && seenIdentity.has(identity)) {
      throw new CanonicalizationError(
        "DUPLICATE_SET_KEY",
        path,
        "Set-like elements must have unique deterministic identities.",
      );
    }
    if (seenContent.has(item.bytes)) {
      throw new CanonicalizationError(
        "INDISTINGUISHABLE_NORMALIZED_ELEMENT",
        path,
        "Set-like elements must remain distinct after normalization.",
      );
    }
    seenContent.add(item.bytes);
    if (identity && seenIdentity.has(identity)) {
      throw new CanonicalizationError(
        "DUPLICATE_SET_KEY",
        path,
        "Set-like elements must have unique deterministic identities.",
      );
    }
    if (identity) seenIdentity.add(identity);
  }
}

function getField(value: unknown, key: string): unknown {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function enter(value: object, path: string, state: State): void {
  if (state.ancestors.has(value)) {
    throw new CanonicalizationError(
      "CYCLIC_VALUE",
      path,
      "Cyclic values cannot be canonicalized.",
    );
  }
  state.ancestors.add(value);
}

function joinPath(parent: string, child: string): string {
  return parent ? `${parent}.${child}` : child;
}

function compareKeyLists(
  left: readonly string[],
  right: readonly string[],
): number {
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    const result = compareText(left[index] ?? "", right[index] ?? "");
    if (result !== 0) return result;
  }
  return 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deterministicHashRoot(value: unknown): {
  readonly value: unknown;
  readonly path: string;
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { value, path: "" };
  }
  const record = value as Record<string, unknown>;
  for (const name of [
    "deterministicPayload",
    "deterministicRequestPayload",
    "deterministicPackagePayload",
    "deterministicProposalPayload",
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(record, name)) {
      return { value: record[name], path: name };
    }
  }
  return { value, path: "" };
}

function normalizeUnicode(value: string, path: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new CanonicalizationError(
          "INVALID_UNICODE",
          path,
          "Deterministic strings cannot contain unpaired UTF-16 surrogates.",
        );
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new CanonicalizationError(
        "INVALID_UNICODE",
        path,
        "Deterministic strings cannot contain unpaired UTF-16 surrogates.",
      );
    }
  }
  return value.normalize("NFC");
}

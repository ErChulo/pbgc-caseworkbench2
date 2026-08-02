import referenceIndexData from "./approved-reference-index.generated.json";
import type { ApprovedV1SummaryReference } from "./models";
import { parseSha256 } from "../shared/types";

interface GeneratedReferenceIndex {
  readonly indexVersion: "approved-v1-summary-reference-index-v1.0.0";
  readonly corpusPath: "reference/approved-v1-summaries";
  readonly references: readonly GeneratedReference[];
}

interface GeneratedReference {
  readonly referenceId: string;
  readonly fileName: string;
  readonly workbookName: string;
  readonly contentSha256: string;
  readonly schemaVersion: string;
  readonly keyMode: string;
  readonly sourceTabs: readonly string[];
  readonly runs: readonly string[];
  readonly cellCount: number;
  readonly uniqueFieldCount: number;
  readonly formulaCellCount: number;
  readonly iobCounts: {
    readonly I: number;
    readonly O: number;
    readonly B: number;
    readonly N: number;
    readonly C: number;
    readonly other: number;
  };
  readonly genericFields: readonly string[];
}

const data = referenceIndexData as GeneratedReferenceIndex;

export const APPROVED_V1_REFERENCE_INDEX_VERSION = data.indexVersion;
export const APPROVED_V1_REFERENCE_CORPUS_PATH = data.corpusPath;

export const approvedV1SummaryReferences: readonly ApprovedV1SummaryReference[] =
  Object.freeze(data.references.map(parseReference));

function parseReference(
  reference: GeneratedReference,
): ApprovedV1SummaryReference {
  const parsedHash = parseSha256(reference.contentSha256);
  if (!parsedHash.ok) {
    throw new Error(
      `Approved V1 reference ${reference.fileName} has an invalid SHA-256.`,
    );
  }
  return deepFreeze({
    ...reference,
    contentSha256: parsedHash.value,
    sourceTabs: [...reference.sourceTabs],
    runs: [...reference.runs],
    iobCounts: { ...reference.iobCounts },
    genericFields: [...reference.genericFields],
  });
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

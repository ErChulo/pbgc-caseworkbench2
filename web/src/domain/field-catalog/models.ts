import {
  parseSha256,
  parseUuid,
  type Result,
  type Sha256,
  type Uuid,
} from "../shared/types";

const approvedHash = parseSha256(
  "d7b7c63a432ecc0e7e9e1371a65effeae552b13d8a53a952752bd206ee79bc96",
);
if (!approvedHash.ok) {
  throw new Error("Approved Data Dictionary SHA-256 is invalid.");
}

export const APPROVED_DATA_DICTIONARY_SHA256 = approvedHash.value;
export const APPROVED_DATA_DICTIONARY_BYTE_SIZE = 104_966;
export const APPROVED_DATA_DICTIONARY_PATH =
  "reference/field-catalogs/atpbgc/data_dictionary_complete.xlsm";

export interface OfficialFieldIdentity {
  readonly catalogSha256: Sha256;
  readonly tableName: string;
  readonly fieldName: string;
}

export interface OfficialFieldRecord {
  readonly identity: OfficialFieldIdentity;
  readonly sourceSheet: "data_dictionary_complete";
  readonly sourceRow: number;
  readonly description: string | number;
  readonly rawDataType: string;
  readonly rawFieldSize: string | number;
  readonly rawCategoryText: string | null;
  readonly formulaText: string;
  readonly cachedFormulaText: string;
  readonly evaluatedByParser: false;
}

export type FieldNameLookup =
  | {
      readonly status: "not-found";
      readonly fieldName: string;
    }
  | {
      readonly status: "unique";
      readonly fieldName: string;
      readonly record: OfficialFieldRecord;
    }
  | {
      readonly status: "ambiguous";
      readonly fieldName: string;
      readonly records: readonly OfficialFieldRecord[];
    };

export interface OfficialFieldCatalogIndex {
  readonly catalogSha256: Sha256;
  readonly byteSize: number;
  readonly records: readonly OfficialFieldRecord[];
  find(tableName: string, fieldName: string): OfficialFieldRecord | null;
  lookupFieldName(fieldName: string): FieldNameLookup;
}

export interface OfficialFieldTarget {
  readonly kind: "official";
  readonly catalogSha256: Sha256;
  readonly tableName: string;
  readonly fieldName: string;
}

export interface UserDefinedFieldTarget {
  readonly kind: "user-defined";
  readonly caseId: Uuid;
  readonly fieldId: Uuid;
  readonly fieldName: string;
  readonly definitionContentSha256: Sha256;
  readonly effectiveApprovalDecisionId: Uuid;
  readonly effectiveApprovalDecisionContentSha256: Sha256;
}

export type CaseWorkbenchFieldTarget =
  OfficialFieldTarget | UserDefinedFieldTarget;

export function createOfficialFieldCatalogIndex(
  records: readonly OfficialFieldRecord[],
): Result<OfficialFieldCatalogIndex, string> {
  const byIdentity = new Map<string, OfficialFieldRecord>();
  const byFieldName = new Map<
    string,
    [OfficialFieldRecord, ...OfficialFieldRecord[]]
  >();
  const ordered = [...records].sort(
    (left, right) => left.sourceRow - right.sourceRow,
  );
  for (const record of ordered) {
    if (
      record.identity.catalogSha256 !== APPROVED_DATA_DICTIONARY_SHA256 ||
      record.identity.tableName.length === 0 ||
      record.identity.fieldName.length === 0
    ) {
      return failure("Official field identity is invalid.");
    }
    const key = identityKey(
      record.identity.tableName,
      record.identity.fieldName,
    );
    if (byIdentity.has(key)) {
      return failure(
        "Official table-qualified field identities must be unique.",
      );
    }
    byIdentity.set(key, record);
    const sameName = byFieldName.get(record.identity.fieldName);
    if (sameName === undefined) {
      byFieldName.set(record.identity.fieldName, [record]);
    } else {
      sameName.push(record);
    }
  }
  const frozenRecords = Object.freeze(ordered.map(deepFreeze));
  return {
    ok: true,
    value: Object.freeze({
      catalogSha256: APPROVED_DATA_DICTIONARY_SHA256,
      byteSize: APPROVED_DATA_DICTIONARY_BYTE_SIZE,
      records: frozenRecords,
      find(tableName: string, fieldName: string) {
        return byIdentity.get(identityKey(tableName, fieldName)) ?? null;
      },
      lookupFieldName(fieldName: string): FieldNameLookup {
        const matches = byFieldName.get(fieldName);
        if (matches === undefined) {
          return Object.freeze({ status: "not-found", fieldName });
        }
        if (matches.length === 1) {
          return Object.freeze({
            status: "unique",
            fieldName,
            record: matches[0],
          });
        }
        return Object.freeze({
          status: "ambiguous",
          fieldName,
          records: Object.freeze([...matches]),
        });
      },
    }),
  };
}

export function createOfficialFieldTarget(
  catalog: OfficialFieldCatalogIndex,
  tableName: string,
  fieldName: string,
): Result<OfficialFieldTarget, string> {
  const record = catalog.find(tableName, fieldName);
  if (record === null) {
    return failure(
      "Official field identity was not found in the approved catalog.",
    );
  }
  return {
    ok: true,
    value: Object.freeze({
      kind: "official",
      catalogSha256: catalog.catalogSha256,
      tableName: record.identity.tableName,
      fieldName: record.identity.fieldName,
    }),
  };
}

export function createUserDefinedFieldTarget(input: {
  readonly caseId: string;
  readonly fieldId: string;
  readonly fieldName: string;
  readonly definitionContentSha256: string;
  readonly effectiveApprovalDecisionId: string;
  readonly effectiveApprovalDecisionContentSha256: string;
}): Result<UserDefinedFieldTarget, string> {
  const caseId = parseUuid(input.caseId);
  const fieldId = parseUuid(input.fieldId);
  const definitionContentSha256 = parseSha256(input.definitionContentSha256);
  const effectiveApprovalDecisionId = parseUuid(
    input.effectiveApprovalDecisionId,
  );
  const effectiveApprovalDecisionContentSha256 = parseSha256(
    input.effectiveApprovalDecisionContentSha256,
  );
  if (
    !caseId.ok ||
    !fieldId.ok ||
    input.fieldName.trim().length === 0 ||
    !definitionContentSha256.ok ||
    !effectiveApprovalDecisionId.ok ||
    !effectiveApprovalDecisionContentSha256.ok
  ) {
    return failure(
      "User-defined field identity or approval lineage is invalid.",
    );
  }
  return {
    ok: true,
    value: Object.freeze({
      kind: "user-defined",
      caseId: caseId.value,
      fieldId: fieldId.value,
      fieldName: input.fieldName,
      definitionContentSha256: definitionContentSha256.value,
      effectiveApprovalDecisionId: effectiveApprovalDecisionId.value,
      effectiveApprovalDecisionContentSha256:
        effectiveApprovalDecisionContentSha256.value,
    }),
  };
}

function identityKey(tableName: string, fieldName: string): string {
  return JSON.stringify([tableName, fieldName]);
}

function failure(message: string): Result<never, string> {
  return { ok: false, error: message };
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

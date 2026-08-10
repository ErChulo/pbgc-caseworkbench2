import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { parseApprovedDataDictionary } from "../../../../src/adapters/parsers/data-dictionary-parser";
import {
  APPROVED_DATA_DICTIONARY_BYTE_SIZE,
  APPROVED_DATA_DICTIONARY_SHA256,
  createOfficialFieldTarget,
  createUserDefinedFieldTarget,
  type OfficialFieldCatalogIndex,
} from "../../../../src/domain/field-catalog/models";

const workbookPath = resolve(
  process.cwd(),
  "reference",
  "field-catalogs",
  "atpbgc",
  "data_dictionary_complete.xlsm",
);

let approvedBytes: Uint8Array;
let catalog: OfficialFieldCatalogIndex;

beforeAll(async () => {
  approvedBytes = new Uint8Array(await readFile(workbookPath));
  const parsed = await parseApprovedDataDictionary(approvedBytes);
  if (!parsed.ok) {
    throw new Error(`${parsed.error.code}: ${parsed.error.safeMessage}`);
  }
  catalog = parsed.value;
});

describe("approved Data Dictionary parser", () => {
  it("binds all passive metadata records to the approved bytes and source rows", () => {
    expect(approvedBytes.byteLength).toBe(APPROVED_DATA_DICTIONARY_BYTE_SIZE);
    expect(catalog.catalogSha256).toBe(APPROVED_DATA_DICTIONARY_SHA256);
    expect(catalog.records).toHaveLength(1172);
    expect(catalog.records[0]?.sourceRow).toBe(2);
    expect(catalog.records.at(-1)?.sourceRow).toBe(1173);
    expect(
      catalog.records.filter((record) => record.identity.tableName === "ALL"),
    ).toHaveLength(4);
    expect(
      catalog.records.filter((record) => record.rawCategoryText === null),
    ).toHaveLength(15);
    expect(
      catalog.records.filter((record) => record.cachedFormulaText === ""),
    ).toHaveLength(15);
    expect(catalog.records[0]?.evaluatedByParser).toBe(false);
    expect(
      catalog.records.every((record) => record.formulaText.length > 0),
    ).toBe(true);
    expect(
      catalog.records.find((record) => record.sourceRow === 1036)?.description,
    ).toBe(0);
    expect(
      catalog.records.filter(
        (record) => typeof record.rawFieldSize === "number",
      ),
    ).toHaveLength(251);
  });

  it("uses exact table-qualified identity and reports ambiguous field names", () => {
    const ambiguous = catalog.lookupFieldName("CUSTOMER_DELETE_FLAG");
    expect(ambiguous.status).toBe("ambiguous");
    if (ambiguous.status !== "ambiguous") return;
    expect(ambiguous.records).toHaveLength(11);
    expect(
      new Set(ambiguous.records.map((record) => record.identity.tableName))
        .size,
    ).toBe(11);
    for (const record of ambiguous.records) {
      expect(
        catalog.find(record.identity.tableName, record.identity.fieldName),
      ).toBe(record);
    }
    expect(catalog.lookupFieldName("customer_delete_flag")).toEqual({
      status: "not-found",
      fieldName: "customer_delete_flag",
    });
  });

  it("creates only hash-bound official targets or case-scoped user-defined targets", () => {
    const record = catalog.records[0];
    if (record === undefined) throw new Error("Approved catalog is empty.");
    expect(
      createOfficialFieldTarget(
        catalog,
        record.identity.tableName,
        record.identity.fieldName,
      ),
    ).toEqual({
      ok: true,
      value: {
        kind: "official",
        catalogSha256: APPROVED_DATA_DICTIONARY_SHA256,
        tableName: record.identity.tableName,
        fieldName: record.identity.fieldName,
      },
    });
    expect(
      createOfficialFieldTarget(catalog, "ALL", "not-an-official-field").ok,
    ).toBe(false);

    const userDefined = createUserDefinedFieldTarget({
      caseId: "00000000-0000-4000-8000-000000000001",
      fieldId: "00000000-0000-4000-8000-000000000002",
      fieldName: "SYNTHETIC_CASE_FIELD",
      definitionContentSha256: "a".repeat(64),
      effectiveApprovalDecisionId: "00000000-0000-4000-8000-000000000003",
      effectiveApprovalDecisionContentSha256: "b".repeat(64),
    });
    expect(userDefined).toMatchObject({
      ok: true,
      value: {
        kind: "user-defined",
        caseId: "00000000-0000-4000-8000-000000000001",
        fieldName: "SYNTHETIC_CASE_FIELD",
      },
    });
    expect(
      createUserDefinedFieldTarget({
        caseId: "00000000-0000-4000-8000-000000000001",
        fieldId: "00000000-0000-4000-8000-000000000002",
        fieldName: " ",
        definitionContentSha256: "a".repeat(64),
        effectiveApprovalDecisionId: "00000000-0000-4000-8000-000000000003",
        effectiveApprovalDecisionContentSha256: "b".repeat(64),
      }).ok,
    ).toBe(false);
  });

  it("fails closed before parsing bytes with a changed size or hash", async () => {
    const wrongSize = await parseApprovedDataDictionary(
      approvedBytes.slice(0, -1),
    );
    expect(wrongSize).toMatchObject({
      ok: false,
      error: { code: "SIZE_MISMATCH" },
    });

    const wrongHash = approvedBytes.slice();
    wrongHash[wrongHash.length - 1] =
      (wrongHash[wrongHash.length - 1] ?? 0) ^ 1;
    expect(await parseApprovedDataDictionary(wrongHash)).toMatchObject({
      ok: false,
      error: { code: "HASH_MISMATCH" },
    });
  });
});

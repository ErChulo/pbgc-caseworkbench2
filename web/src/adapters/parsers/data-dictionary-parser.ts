import { unzipSync } from "fflate";
import { createSHA256 } from "hash-wasm";
import * as XLSX from "xlsx";

import {
  APPROVED_DATA_DICTIONARY_BYTE_SIZE,
  APPROVED_DATA_DICTIONARY_SHA256,
  createOfficialFieldCatalogIndex,
  type OfficialFieldCatalogIndex,
  type OfficialFieldRecord,
} from "../../domain/field-catalog/models";
import type { Result } from "../../domain/shared/types";

const recordSheetName = "data_dictionary_complete";
const recordSheetPart = "xl/worksheets/sheet2.xml";
const firstRecordRow = 2;
const lastRecordRow = 1173;

const expectedHeaders = [
  "TABLE_NAME",
  "FIELD_NAME",
  "DESCRIPTION",
  "DATA_TYPE",
  "FIELD_SIZE",
  "FIELD CATEGORY",
  "PIPE_SEPARATED_CATEGORIES",
] as const;

const allowedParts = [
  "[Content_Types].xml",
  "_rels/.rels",
  "docProps/app.xml",
  "docProps/core.xml",
  "xl/_rels/workbook.xml.rels",
  "xl/calcChain.xml",
  "xl/metadata.xml",
  "xl/sharedStrings.xml",
  "xl/styles.xml",
  "xl/theme/theme1.xml",
  "xl/workbook.xml",
  "xl/worksheets/sheet1.xml",
  recordSheetPart,
  "xl/worksheets/sheet3.xml",
] as const;

const OOXML_URL_SCHEME = "http";
const OOXML_NAMESPACE_BASE = `${OOXML_URL_SCHEME}://schemas.openxmlformats.org`;
const OOXML_OFFICE_DOC_REL = `${OOXML_NAMESPACE_BASE}/officeDocument/2006/relationships`;
const OOXML_PACKAGE_REL = `${OOXML_NAMESPACE_BASE}/package/2006/relationships`;

const expectedRootRelationships = [
  `rId1|${OOXML_OFFICE_DOC_REL}/officeDocument|xl/workbook.xml|`,
  `rId2|${OOXML_PACKAGE_REL}/metadata/core-properties|docProps/core.xml|`,
  `rId3|${OOXML_OFFICE_DOC_REL}/extended-properties|docProps/app.xml|`,
] as const;

const expectedWorkbookRelationships = [
  `rId1|${OOXML_OFFICE_DOC_REL}/worksheet|worksheets/sheet1.xml|`,
  `rId2|${OOXML_OFFICE_DOC_REL}/worksheet|worksheets/sheet2.xml|`,
  `rId3|${OOXML_OFFICE_DOC_REL}/worksheet|worksheets/sheet3.xml|`,
  `rId4|${OOXML_OFFICE_DOC_REL}/theme|theme/theme1.xml|`,
  `rId5|${OOXML_OFFICE_DOC_REL}/styles|styles.xml|`,
  `rId6|${OOXML_OFFICE_DOC_REL}/sharedStrings|sharedStrings.xml|`,
  `rId7|${OOXML_OFFICE_DOC_REL}/sheetMetadata|metadata.xml|`,
  `rId8|${OOXML_OFFICE_DOC_REL}/calcChain|calcChain.xml|`,
] as const;

const expectedContentTypes = [
  "Default|rels|application/vnd.openxmlformats-package.relationships+xml",
  "Default|xml|application/xml",
  "Override|/docProps/app.xml|application/vnd.openxmlformats-officedocument.extended-properties+xml",
  "Override|/docProps/core.xml|application/vnd.openxmlformats-package.core-properties+xml",
  "Override|/xl/calcChain.xml|application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml",
  "Override|/xl/metadata.xml|application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml",
  "Override|/xl/sharedStrings.xml|application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml",
  "Override|/xl/styles.xml|application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml",
  "Override|/xl/theme/theme1.xml|application/vnd.openxmlformats-officedocument.theme+xml",
  "Override|/xl/workbook.xml|application/vnd.ms-excel.sheet.macroEnabled.main+xml",
  "Override|/xl/worksheets/sheet1.xml|application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
  "Override|/xl/worksheets/sheet2.xml|application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
  "Override|/xl/worksheets/sheet3.xml|application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
] as const;

const expectedSheets = [
  "background|5||rId1",
  "data_dictionary_complete|1||rId2",
  "categories|6|hidden|rId3",
] as const;

const expectedDefinedNames = [
  "_xlnm._FilterDatabase|1|1||data_dictionary_complete!$A$1:$G$1173",
  "_xlpm.matches||1|1|#NAME?",
  "_xlpm.pattern||1|1|#NAME?",
  "_xlpm.txt||1|1|#NAME?",
  "_xlpm.words||1|1|#NAME?",
  "categories||||categories!$C$1:$C$54",
] as const;

export interface DataDictionaryParseError {
  readonly code:
    | "SIZE_MISMATCH"
    | "HASH_MISMATCH"
    | "PACKAGE_PREFLIGHT_FAILED"
    | "WORKBOOK_STRUCTURE_INVALID";
  readonly safeMessage: string;
}

interface FormulaObservation {
  readonly formulaText: string;
  readonly cachedFormulaText: string;
}

interface CellValue {
  readonly v?: unknown;
  readonly t?: string;
}

export async function parseApprovedDataDictionary(
  bytes: Uint8Array,
): Promise<Result<OfficialFieldCatalogIndex, DataDictionaryParseError>> {
  if (bytes.byteLength !== APPROVED_DATA_DICTIONARY_BYTE_SIZE) {
    return failure(
      "SIZE_MISMATCH",
      "Data Dictionary bytes do not match the approved byte size.",
    );
  }
  const hasher = await createSHA256();
  hasher.update(bytes);
  if (hasher.digest("hex") !== APPROVED_DATA_DICTIONARY_SHA256) {
    return failure(
      "HASH_MISMATCH",
      "Data Dictionary bytes do not match the approved SHA-256.",
    );
  }

  const preflight = preflightPackage(bytes);
  if (!preflight.ok) return preflight;

  try {
    const workbook = XLSX.read(bytes, {
      type: "array",
      cellDates: false,
      cellFormula: true,
      cellStyles: false,
      raw: true,
      bookVBA: false,
    });
    if (
      JSON.stringify(workbook.SheetNames) !==
        JSON.stringify(["background", recordSheetName, "categories"]) ||
      JSON.stringify(
        (workbook.Workbook?.Sheets ?? []).map((sheet) => ({
          name: sheet.name,
          hidden: sheet.Hidden ?? 0,
        })),
      ) !==
        JSON.stringify([
          { name: "background", hidden: 0 },
          { name: recordSheetName, hidden: 0 },
          { name: "categories", hidden: 1 },
        ])
    ) {
      return structureFailure("Workbook sheet identity or visibility changed.");
    }
    const sheet = workbook.Sheets[recordSheetName];
    if (
      sheet?.["!ref"] !== "A1:G1173" ||
      sheet["!autofilter"]?.ref !== "A1:G1173"
    ) {
      return structureFailure("Data Dictionary record range changed.");
    }
    for (const [index, header] of expectedHeaders.entries()) {
      const address = `${String.fromCharCode(65 + index)}1`;
      if (cellValue(sheet[address]) !== header) {
        return structureFailure("Data Dictionary headers changed.");
      }
    }

    const formulas = extractFormulaObservations(
      decodeXml(preflight.value[recordSheetPart]),
    );
    if (!formulas.ok) return formulas;
    const records: OfficialFieldRecord[] = [];
    for (
      let sourceRow = firstRecordRow;
      sourceRow <= lastRecordRow;
      sourceRow += 1
    ) {
      const row = String(sourceRow);
      const tableName = cellValue(sheet[`A${row}`]);
      const fieldName = cellValue(sheet[`B${row}`]);
      const description = cellValue(sheet[`C${row}`]);
      const rawDataType = cellValue(sheet[`D${row}`]);
      const rawFieldSize = cellValue(sheet[`E${row}`]);
      const rawCategory = cellValue(sheet[`F${row}`], true);
      const formula = formulas.value.get(sourceRow);
      if (
        typeof tableName !== "string" ||
        tableName.length === 0 ||
        typeof fieldName !== "string" ||
        fieldName.length === 0 ||
        !isStringOrNumber(description) ||
        typeof rawDataType !== "string" ||
        rawDataType.length === 0 ||
        !isStringOrNumber(rawFieldSize) ||
        (rawCategory !== null && typeof rawCategory !== "string") ||
        formula === undefined
      ) {
        return structureFailure(
          `Data Dictionary row ${String(sourceRow)} is structurally invalid.`,
        );
      }
      records.push({
        identity: {
          catalogSha256: APPROVED_DATA_DICTIONARY_SHA256,
          tableName,
          fieldName,
        },
        sourceSheet: recordSheetName,
        sourceRow,
        description,
        rawDataType,
        rawFieldSize,
        rawCategoryText: rawCategory,
        formulaText: formula.formulaText,
        cachedFormulaText: formula.cachedFormulaText,
        evaluatedByParser: false,
      });
    }
    const indexed = createOfficialFieldCatalogIndex(records);
    return indexed.ok
      ? { ok: true, value: indexed.value }
      : structureFailure(indexed.error);
  } catch {
    return structureFailure(
      "Approved Data Dictionary could not be parsed without repair.",
    );
  }
}

function preflightPackage(
  bytes: Uint8Array,
): Result<Record<string, Uint8Array>, DataDictionaryParseError> {
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(bytes);
  } catch {
    return preflightFailure("Data Dictionary is not a readable OOXML package.");
  }
  if (!sameStrings(Object.keys(parts), allowedParts)) {
    return preflightFailure("Data Dictionary package parts changed.");
  }
  try {
    const rootRelationships = relationshipSignatures(
      decodeXml(parts["_rels/.rels"]),
    );
    const workbookRelationships = relationshipSignatures(
      decodeXml(parts["xl/_rels/workbook.xml.rels"]),
    );
    if (
      rootRelationships.some((value) => value.endsWith("|External")) ||
      workbookRelationships.some((value) => value.endsWith("|External")) ||
      !sameStrings(rootRelationships, expectedRootRelationships) ||
      !sameStrings(workbookRelationships, expectedWorkbookRelationships)
    ) {
      return preflightFailure(
        "Data Dictionary relationships changed or became external.",
      );
    }
    if (
      !sameStrings(
        contentTypeSignatures(decodeXml(parts["[Content_Types].xml"])),
        expectedContentTypes,
      )
    ) {
      return preflightFailure("Data Dictionary content types changed.");
    }
    const workbookXml = decodeXml(parts["xl/workbook.xml"]);
    if (
      JSON.stringify(sheetSignatures(workbookXml)) !==
        JSON.stringify(expectedSheets) ||
      !sameStrings(definedNameSignatures(workbookXml), expectedDefinedNames)
    ) {
      return preflightFailure(
        "Data Dictionary sheets or defined names changed.",
      );
    }
    return { ok: true, value: parts };
  } catch {
    return preflightFailure("Data Dictionary package metadata is invalid.");
  }
}

function relationshipSignatures(xml: string): string[] {
  return elementAttributes(xml, "Relationship").map(
    (attributes) =>
      `${attributes.Id ?? ""}|${attributes.Type ?? ""}|${attributes.Target ?? ""}|${attributes.TargetMode ?? ""}`,
  );
}

function contentTypeSignatures(xml: string): string[] {
  return [
    ...elementAttributes(xml, "Default").map(
      (attributes) =>
        `Default|${attributes.Extension ?? ""}|${attributes.ContentType ?? ""}`,
    ),
    ...elementAttributes(xml, "Override").map(
      (attributes) =>
        `Override|${attributes.PartName ?? ""}|${attributes.ContentType ?? ""}`,
    ),
  ];
}

function sheetSignatures(xml: string): string[] {
  return elementAttributes(xml, "sheet").map(
    (attributes) =>
      `${attributes.name ?? ""}|${attributes.sheetId ?? ""}|${attributes.state ?? ""}|${attributes["r:id"] ?? ""}`,
  );
}

function definedNameSignatures(xml: string): string[] {
  const result: string[] = [];
  const pattern = /<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/gu;
  for (const match of xml.matchAll(pattern)) {
    const attributes = parseAttributes(match[1] ?? "");
    result.push(
      `${attributes.name ?? ""}|${attributes.localSheetId ?? ""}|${attributes.hidden ?? ""}|${attributes.xlm ?? ""}|${decodeXmlText(match[2] ?? "")}`,
    );
  }
  return result;
}

function extractFormulaObservations(
  xml: string,
): Result<ReadonlyMap<number, FormulaObservation>, DataDictionaryParseError> {
  const formulas = new Map<number, FormulaObservation>();
  const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/gu;
  for (const match of xml.matchAll(cellPattern)) {
    const attributes = parseAttributes(match[1] ?? "");
    const address = attributes.r ?? "";
    const coordinate = /^G(\d+)$/u.exec(address);
    if (coordinate === null) continue;
    const sourceRow = Number(coordinate[1]);
    if (sourceRow < firstRecordRow || sourceRow > lastRecordRow) continue;
    const body = match[2] ?? "";
    const formulaMatch = /<f\b([^>]*)>([\s\S]*?)<\/f>/u.exec(body);
    const valueMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/u.exec(body);
    const emptyValue = /<v\b[^>]*\/>/u.test(body);
    const formulaAttributes = parseAttributes(formulaMatch?.[1] ?? "");
    if (
      attributes.t !== "str" ||
      attributes.cm !== "1" ||
      formulaMatch === null ||
      formulaAttributes.t !== "array" ||
      formulaAttributes.ref !== address ||
      (valueMatch === null && !emptyValue) ||
      formulas.has(sourceRow)
    ) {
      return structureFailure(
        `Formula observation at ${address} is structurally invalid.`,
      );
    }
    formulas.set(sourceRow, {
      formulaText: decodeXmlText(formulaMatch[2] ?? ""),
      cachedFormulaText: decodeXmlText(valueMatch?.[1] ?? ""),
    });
  }
  if (formulas.size !== lastRecordRow - firstRecordRow + 1) {
    return structureFailure(
      "Data Dictionary formula observations are incomplete.",
    );
  }
  return { ok: true, value: formulas };
}

function elementAttributes(
  xml: string,
  elementName: string,
): readonly Record<string, string>[] {
  const pattern = new RegExp(`<${elementName}\\b([^>]*)/?>`, "gu");
  return [...xml.matchAll(pattern)].map((match) =>
    parseAttributes(match[1] ?? ""),
  );
}

function parseAttributes(text: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/gu;
  for (const match of text.matchAll(pattern)) {
    const name = match[1];
    if (name !== undefined) attributes[name] = decodeXmlText(match[2] ?? "");
  }
  return attributes;
}

function cellValue(value: unknown, missingAsNull = false): unknown {
  if (value === undefined) return missingAsNull ? null : undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return (value as CellValue).v;
}

function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function sameStrings(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
  );
}

function decodeXml(value: Uint8Array | undefined): string {
  if (value === undefined) throw new Error("Required OOXML part is missing.");
  return new TextDecoder("utf-8", { fatal: true }).decode(value);
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )
    .replace(/&#(\d+);/gu, (_, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 10)),
    )
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function preflightFailure(
  safeMessage: string,
): Result<never, DataDictionaryParseError> {
  return failure("PACKAGE_PREFLIGHT_FAILED", safeMessage);
}

function structureFailure(
  safeMessage: string,
): Result<never, DataDictionaryParseError> {
  return failure("WORKBOOK_STRUCTURE_INVALID", safeMessage);
}

function failure(
  code: DataDictionaryParseError["code"],
  safeMessage: string,
): Result<never, DataDictionaryParseError> {
  return { ok: false, error: { code, safeMessage } };
}

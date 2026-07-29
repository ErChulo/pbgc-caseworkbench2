import { strToU8, unzipSync, zipSync } from "fflate";
import * as XLSX from "xlsx";

export const textFixture = () =>
  new TextEncoder().encode("alpha\nzero=0\nblank=");
export const invalidUtf8Fixture = () => new Uint8Array([0xc3, 0x28]);
export const jsonFixture = () =>
  new TextEncoder().encode('{"generalKey":"synthetic-1","value":"001"}');
export const invalidJsonFixture = () => new TextEncoder().encode('{"broken":');
export const csvFixture = () =>
  new TextEncoder().encode(
    'generalKey,value,formulaText\nsynthetic-1,001,"=1+1"\n',
  );
export const malformedCsvFixture = () =>
  new TextEncoder().encode('generalKey,value\n"synthetic-1,001');

export function workbookFixture(
  options: {
    readonly macro?: boolean;
    readonly external?: boolean;
    readonly embedded?: boolean;
    readonly hidden?: boolean;
  } = {},
): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["generalKey", "stored", "formula"],
    ["synthetic-1", "001", { t: "n", v: 2, f: "1+1" }],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Synthetic");
  if (options.hidden) {
    workbook.Workbook = {
      ...(workbook.Workbook ?? {}),
      Sheets: [{ Hidden: 1 }],
    };
  }
  const bytes = new Uint8Array(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  );
  if (!options.macro && !options.external && !options.embedded) return bytes;
  const parts = unzipForFixture(bytes);
  if (options.macro) parts["xl/vbaProject.bin"] = new Uint8Array([0, 1, 2]);
  if (options.external)
    parts["xl/externalLinks/externalLink1.xml"] = strToU8("<externalLink/>");
  if (options.embedded)
    parts["xl/embeddings/object1.bin"] = new Uint8Array([3, 4]);
  return zipSync(parts);
}

export function docxFixture(
  options: { readonly external?: boolean } = {},
): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(
      '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Synthetic plan text</w:t></w:r></w:p></w:body></w:document>',
    ),
    ...(options.external
      ? {
          "word/_rels/document.xml.rels": strToU8(
            '<Relationships><Relationship TargetMode="External" Target="https://example.invalid"/></Relationships>',
          ),
        }
      : {}),
  });
}

export function pptxFixture(): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "ppt/slides/slide1.xml": strToU8(
      '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Synthetic training slide</a:t></p:sld>',
    ),
  });
}

export const pdfFixture = () =>
  new TextEncoder().encode(
    "%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R /Title (Synthetic PDF) >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n4 0 obj << /Length 23 >> stream\nBT (Passive text) Tj ET\nendstream\nendobj\n%%EOF",
  );
export const multiPagePdfFixture = () =>
  new TextEncoder().encode(
    "%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n4 0 obj << /Length 94 >> stream\nBT (Section 4.1  Benefit = 1.5% of pay.) Tj (Effective 2025-01-01.) Tj ET\nendstream\nendobj\n5 0 obj << /Type /Page /Parent 2 0 R /Contents 6 0 R >> endobj\n6 0 obj << /Length 46 >> stream\nBT (Adopted 2024-12-15.) Tj ET\nendstream\nendobj\n%%EOF",
  );
export const activePdfFixture = () =>
  new TextEncoder().encode(
    "%PDF-1.7\n1 0 obj << /OpenAction 2 0 R /JavaScript (never execute) /URI (https://example.invalid) >> endobj\n%%EOF",
  );
export const encryptedPdfFixture = () =>
  new TextEncoder().encode("%PDF-1.7\n/Encrypt 2 0 R\n%%EOF");
export const corruptFixture = () => new Uint8Array([1, 2, 3, 4]);

function unzipForFixture(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}

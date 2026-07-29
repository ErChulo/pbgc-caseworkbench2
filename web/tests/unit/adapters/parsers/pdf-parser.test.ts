import { describe, expect, it } from "vitest";

import {
  parsePdfPassive,
  type PdfTextSpan,
} from "../../../../src/adapters/parsers/pdf-parser";
import { multiPagePdfFixture } from "../../../fixtures/generators/passive-formats";

describe("passive PDF page spans", () => {
  it("retains deterministic page-relative offsets and verbatim text", () => {
    const result = parsePdfPassive(multiPagePdfFixture());
    expect(result).toMatchObject({
      status: "success",
      text: "Section 4.1  Benefit = 1.5% of pay.\nEffective 2025-01-01.\nAdopted 2024-12-15.",
      metadata: { pageCount: 2 },
    });
    expect(result.rawValues).toEqual([
      {
        kind: "pdf-text-span",
        pageNumber: 1,
        startOffset: 0,
        endOffset: 35,
        verbatimText: "Section 4.1  Benefit = 1.5% of pay.",
      },
      {
        kind: "pdf-text-span",
        pageNumber: 1,
        startOffset: 36,
        endOffset: 57,
        verbatimText: "Effective 2025-01-01.",
      },
      {
        kind: "pdf-text-span",
        pageNumber: 2,
        startOffset: 0,
        endOffset: 19,
        verbatimText: "Adopted 2024-12-15.",
      },
    ] satisfies readonly PdfTextSpan[]);
  });

  it("does not assign a page when no declared page tree proves one", () => {
    const bytes = new TextEncoder().encode(
      "%PDF-1.7\nBT (Unmapped text) Tj ET\n%%EOF",
    );
    const result = parsePdfPassive(bytes);
    expect(result.status).toBe("partial");
    expect(result.text).toBe("Unmapped text");
    expect(result.rawValues).toEqual([]);
    expect(result.limitations).toContain(
      "Some extracted PDF text could not be associated with a declared page-tree content reference.",
    );
  });

  it("resolves the exact generation named by page-tree and content references", () => {
    const result = parsePdfPassive(
      pdf(`
1 0 obj << /Type /Catalog /Pages 2 1 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] >> endobj
2 1 obj << /Type /Pages /Kids [3 1 R] >> endobj
3 0 obj << /Type /Page /Contents 4 0 R >> endobj
3 1 obj << /Type /Page /Contents 4 1 R >> endobj
4 0 obj << /Length 20 >> stream BT (Old generation) Tj ET endstream endobj
4 1 obj << /Length 24 >> stream BT (Exact generation one) Tj ET endstream endobj`),
    );

    expect(result.status).toBe("partial");
    expect(result.rawValues).toEqual([
      {
        kind: "pdf-text-span",
        pageNumber: 1,
        startOffset: 0,
        endOffset: 20,
        verbatimText: "Exact generation one",
      },
    ] satisfies readonly PdfTextSpan[]);
  });

  it("uses the latest incremental declaration while retaining exact generations", () => {
    const result = parsePdfPassive(
      pdf(`
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] >> endobj
3 0 obj << /Type /Page /Contents 4 0 R >> endobj
4 0 obj << /Length 16 >> stream BT (Initial text) Tj ET endstream endobj
1 0 obj << /Type /Catalog /Pages 2 2 R >> endobj
2 2 obj << /Type /Pages /Kids [3 2 R] >> endobj
3 2 obj << /Type /Page /Contents 4 2 R >> endobj
4 2 obj << /Length 20 >> stream BT (Incremental text) Tj ET endstream endobj`),
    );

    expect(result.rawValues).toEqual([
      {
        kind: "pdf-text-span",
        pageNumber: 1,
        startOffset: 0,
        endOffset: 16,
        verbatimText: "Incremental text",
      },
    ] satisfies readonly PdfTextSpan[]);
  });
});

function pdf(objects: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7\n${objects.trim()}\n%%EOF`);
}

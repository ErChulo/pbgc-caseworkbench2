import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseOoxmlPassive } from "../../src/adapters/parsers/ooxml-parser";
import { parseWorkbookPassive } from "../../src/adapters/parsers/workbook-parser";
import { workbookFixture } from "../fixtures/generators/passive-formats";
import { unzipSync } from "fflate";
import { readBoundedOoxmlParts } from "../../src/adapters/parsers/bounded-ooxml-parts";

function document(text: string) {
  return zipSync({ "word/document.xml": strToU8(`<w:t>${text}</w:t>`) });
}

function findSignature(bytes: Uint8Array, signature: readonly number[]) {
  for (let i = 0; i <= bytes.length - signature.length; i++) {
    if (signature.every((value, offset) => bytes[i + offset] === value))
      return i;
  }
  throw new Error("ZIP signature not found");
}

describe("bounded passive OOXML expansion", () => {
  it("extracts multi-chunk text and reports source risk", () => {
    const text = "synthetic information ".repeat(20_000);
    const bytes = zipSync({
      "word/document.xml": strToU8(`<w:t>${text}</w:t>`),
      "word/_rels/document.xml.rels": strToU8(
        '<Relationships><Relationship TargetMode="External"/></Relationships>',
      ),
    });
    const parsed = parseOoxmlPassive(bytes, "docx");
    expect(parsed.text).toBe(text);
    expect(parsed.status).toBe("partial");
    expect(parsed.riskIndicators[0]).toContain("external-relationship");
  });

  it("rejects oversized parts, unsafe paths, and case-folded collisions", () => {
    const oversized = document("a".repeat(8 * 1024 * 1024 + 1));
    expect(parseOoxmlPassive(oversized, "docx").status).toBe("unreadable");
    const invalidParts: Record<string, Uint8Array>[] = [
      {
        "word/document.xml": strToU8("test"),
        "word/../escape.xml": strToU8("x"),
      },
      {
        "word/document.xml": strToU8("test"),
        "WORD/DOCUMENT.XML": strToU8("x"),
      },
    ];
    for (const parts of invalidParts)
      expect(parseOoxmlPassive(zipSync(parts), "docx").status).toBe(
        "unreadable",
      );
  });

  it("screens uppercase relationship extensions and limits total parts", () => {
    const parts = zipSync({
      "word/document.xml": strToU8("<w:t>test</w:t>"),
      "word/_rels/document.xml.RELS": strToU8(
        '<Relationships><Relationship TargetMode="External"/></Relationships>',
      ),
    });
    const parsed = parseOoxmlPassive(parts, "docx");
    expect(parsed.status).toBe("partial");
    expect(parsed.parserVersion).toBe("1.2.0");
    expect(parsed.riskIndicators[0]).toContain("external-relationship");
    const many: Record<string, Uint8Array> = {
      "word/document.xml": strToU8("test"),
    };
    for (let i = 0; i < 2_000; i++)
      many[`word/p${String(i)}`] = new Uint8Array();
    const rejected = parseOoxmlPassive(zipSync(many), "docx");
    expect(rejected.status).toBe("unreadable");
    expect(rejected.parserVersion).toBe("1.2.0");
  });

  it("rejects forged local and central sizes based on observed expansion", () => {
    const bytes = document("x".repeat(200_000));
    const local = findSignature(bytes, [0x50, 0x4b, 0x03, 0x04]);
    const central = findSignature(bytes, [0x50, 0x4b, 0x01, 0x02]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint32(local + 22, 1, true);
    view.setUint32(central + 24, 1, true);
    expect(() => readBoundedOoxmlParts(bytes)).toThrow();
    expect(parseOoxmlPassive(bytes, "docx").status).toBe("unreadable");
  });

  it("rejects central/local mismatches and truncated containers", () => {
    const bytes = document("synthetic");
    const central = findSignature(bytes, [0x50, 0x4b, 0x01, 0x02]);
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
      central + 24,
      1,
      true,
    );
    expect(parseOoxmlPassive(bytes, "docx").status).toBe("unreadable");
    expect(
      parseOoxmlPassive(document("test").slice(0, 40), "docx").status,
    ).toBe("unreadable");
  });
});

describe("bounded workbook package preflight", () => {
  it("rejects oversized worksheet XML before workbook parsing", () => {
    const parts = unzipSync(workbookFixture());
    parts["xl/worksheets/sheet1.xml"] = strToU8(
      "x".repeat(8 * 1024 * 1024 + 1),
    );
    const result = parseWorkbookPassive(zipSync(parts));
    expect(result.status).toBe("unreadable");
    expect(result.parserVersion).toBe("1.4.0");
    expect(result.rawValues).toEqual([]);
  });

  it("rejects forged expanded sizes in local and central workbook headers", () => {
    const bytes = workbookFixture();
    const local = findSignature(bytes, [0x50, 0x4b, 0x03, 0x04]);
    const central = findSignature(bytes, [0x50, 0x4b, 0x01, 0x02]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint32(local + 22, 1, true);
    view.setUint32(central + 24, 1, true);
    const result = parseWorkbookPassive(bytes);
    expect(result.status).toBe("unreadable");
    expect(result.rawValues).toEqual([]);
  });

  it("does not retain workbook XML when only relationships are requested", () => {
    const parts = readBoundedOoxmlParts(workbookFixture(), {
      relationshipsOnly: true,
      maxRelationshipBytes: 4 * 1024 * 1024,
    });
    expect(parts.names).toContain("xl/workbook.xml");
    expect(parts.xmlParts.has("xl/workbook.xml")).toBe(false);
    expect(parts.xmlParts.has("xl/_rels/workbook.xml.rels")).toBe(true);
    expect(parseWorkbookPassive(workbookFixture()).parserVersion).toBe("1.4.0");
  });
});

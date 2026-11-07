import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseOoxmlPassive } from "../../src/adapters/parsers/ooxml-parser";
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
    expect(parsed.parserVersion).toBe("1.1.0");
    expect(parsed.riskIndicators[0]).toContain("external-relationship");
    const many: Record<string, Uint8Array> = {
      "word/document.xml": strToU8("test"),
    };
    for (let i = 0; i < 2_000; i++)
      many[`word/p${String(i)}`] = new Uint8Array();
    const rejected = parseOoxmlPassive(zipSync(many), "docx");
    expect(rejected.status).toBe("unreadable");
    expect(rejected.parserVersion).toBe("1.1.0");
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

import { describe, expect, it } from "vitest";

import {
  parseDelimited,
  parseDelimitedStream,
} from "../../src/adapters/parsers/delimited-parser";
import { parseJson } from "../../src/adapters/parsers/json-parser";
import { parseOoxmlPassive } from "../../src/adapters/parsers/ooxml-parser";
import { inspectPassive } from "../../src/adapters/parsers/passive-inspection";
import { parsePdfPassive } from "../../src/adapters/parsers/pdf-parser";
import { parsePlainText } from "../../src/adapters/parsers/text-parser";
import { parseWorkbookPassive } from "../../src/adapters/parsers/workbook-parser";
import {
  activePdfFixture,
  csvFixture,
  docxFixture,
  encryptedPdfFixture,
  invalidJsonFixture,
  invalidUtf8Fixture,
  jsonFixture,
  malformedCsvFixture,
  pdfFixture,
  pptxFixture,
  textFixture,
  workbookFixture,
} from "../fixtures/generators/passive-formats";

describe("T064 passive inspection", () => {
  it("preserves plain text, JSON, and delimited raw values", () => {
    const text = parsePlainText(textFixture());
    expect(text.status).toBe("success");
    expect(text.text).toContain("zero=0");
    expect(parseJson(jsonFixture())).toMatchObject({ status: "success" });
    const delimited = parseDelimited(csvFixture(), ",");
    expect(delimited.status).toBe("success");
    expect(delimited.rawValues).toContainEqual(["synthetic-1", "001", "=1+1"]);
  });

  it("accepts CSV/TSV as deterministic byte streams", async () => {
    const source = csvFixture();
    async function* chunks() {
      await Promise.resolve();
      yield source.slice(0, 7);
      yield source.slice(7, 19);
      yield source.slice(19);
    }
    const result = await parseDelimitedStream(chunks(), ",");
    expect(result.status).toBe("success");
    expect(result.rawValues).toContainEqual(["synthetic-1", "001", "=1+1"]);
  });

  it("fails closed for encoding and structural errors without repair", () => {
    expect(parsePlainText(invalidUtf8Fixture()).status).toBe("unreadable");
    expect(parseJson(invalidJsonFixture()).status).toBe("unreadable");
    expect(parseDelimited(malformedCsvFixture(), ",").status).toBe(
      "unreadable",
    );
  });

  it("records workbook stored values and formula text without execution", () => {
    const result = parseWorkbookPassive(workbookFixture({ hidden: true }));
    expect(result.status).toBe("success");
    expect(result.metadata.formulaCount).toBe(1);
    expect(result.metadata.hiddenSheetCount).toBe(1);
    expect(
      result.rawValues.some(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          "storedValue" in value &&
          value.storedValue === 2 &&
          "formulaText" in value &&
          value.formulaText === "1+1",
      ),
    ).toBe(true);
  });

  it("returns a structured unsupported result for unknown passive formats", () => {
    const result = inspectPassive("synthetic.unknown", new Uint8Array([1, 2]));
    expect(result.status).toBe("unsupported");
    expect(result.limitations).toEqual([
      "The initial passive parser set does not support this format.",
    ]);
  });

  it("detects OOXML macro, embedding, and external-link structures passively", () => {
    const result = parseWorkbookPassive(
      workbookFixture({ macro: true, embedded: true, external: true }),
    );
    expect(result.status).toBe("partial");
    expect(
      result.riskIndicators.some((value) => value.startsWith("macro:")),
    ).toBe(true);
    expect(
      result.riskIndicators.some((value) =>
        value.startsWith("embedded-object:"),
      ),
    ).toBe(true);
    expect(
      result.riskIndicators.some((value) => value.startsWith("external-link:")),
    ).toBe(true);
  });

  it("extracts DOCX/PPTX text and records external relationships without following them", () => {
    expect(parseOoxmlPassive(docxFixture(), "docx").text).toContain(
      "Synthetic plan text",
    );
    expect(parseOoxmlPassive(pptxFixture(), "pptx").text).toContain(
      "Synthetic training slide",
    );
    expect(
      parseOoxmlPassive(docxFixture({ external: true }), "docx")
        .riskIndicators[0],
    ).toContain("external-relationship:");
  });

  it("extracts passive PDF text and blocks active/encrypted structures", () => {
    expect(parsePdfPassive(pdfFixture())).toMatchObject({
      status: "success",
      text: "Passive text",
    });
    const active = parsePdfPassive(activePdfFixture());
    expect(active.status).toBe("partial");
    expect(active.riskIndicators).toEqual([
      "/JavaScript",
      "/OpenAction",
      "/URI",
    ]);
    expect(parsePdfPassive(encryptedPdfFixture()).status).toBe("blocked");
  });
});

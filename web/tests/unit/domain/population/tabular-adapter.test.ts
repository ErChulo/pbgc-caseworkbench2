import { describe, expect, it } from "vitest";

import { parseDelimited } from "../../../../src/adapters/parsers/delimited-parser";
import { parseJson } from "../../../../src/adapters/parsers/json-parser";
import { parsePlainText } from "../../../../src/adapters/parsers/text-parser";
import { adaptTabularExtraction } from "../../../../src/domain/population/tabular-adapter";
import {
  malformedSyntheticPopulationCsv,
  syntheticPopulationCsv,
  syntheticPopulationTsv,
} from "../../../fixtures/generators/populations";

describe("T091 population tabular adapter", () => {
  it.each([
    ["CSV", syntheticPopulationCsv(), "," as const],
    ["TSV", syntheticPopulationTsv(), "\t" as const],
  ])(
    "preserves %s parser rows, widths, encoding, and structural findings",
    (_, bytes, delimiter) => {
      const extraction = parseDelimited(bytes, delimiter);
      const profile = adaptTabularExtraction(extraction);
      expect(profile.status).toBe("profiled");
      expect(profile.encoding).toBe("utf-8");
      expect(profile.rowWidths).toEqual(
        extraction.rawValues.map((row) => (row as unknown[]).length),
      );
      expect(profile.structurallyValid).toBe(false);
      expect(profile.observations.some((item) => item.kind === "missing")).toBe(
        true,
      );
      expect(
        profile.observations.some((item) => item.kind === "leading-zero-text"),
      ).toBe(true);
    },
  );

  it("adapts JSON arrays of records without correcting missing members", () => {
    const extraction = parseJson(
      new TextEncoder().encode(
        '[{"generalKey":"SYN-1","value":0},{"generalKey":"SYN-2"}]',
      ),
    );
    const profile = adaptTabularExtraction(extraction);
    expect(profile.headers).toEqual(["generalKey", "value"]);
    expect(profile.observations.map((item) => item.kind)).toContain("missing");
    expect(profile.observations.map((item) => item.kind)).toContain(
      "literal-zero",
    );
  });

  it("preserves plain text as one-column observed rows", () => {
    const profile = adaptTabularExtraction(
      parsePlainText(new TextEncoder().encode("header\nvalue\n")),
    );
    expect(profile.observations.map((item) => item.value)).toContain("value");
  });

  it("fails closed when the shared parser reports corruption", () => {
    const extraction = parseDelimited(malformedSyntheticPopulationCsv(), ",");
    const profile = adaptTabularExtraction(extraction);
    expect(profile.status).toBe("blocked");
    expect(profile.observations).toEqual([]);
    expect(profile.limitations.join(" ")).toMatch(/Unterminated/u);
  });
});

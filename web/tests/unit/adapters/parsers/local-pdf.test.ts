import { describe, expect, it } from "vitest";

import {
  extractLocalPdfMachineText,
  splitPdfMachineTextPages,
} from "../../../../src/adapters/parsers/local-pdf";
import { screenSensitiveText } from "../../../../src/adapters/screening/sensitive-data";
import { parseSha256 } from "../../../../src/domain/shared/types";
import { pdfJsFixture } from "../../../fixtures/generators/passive-formats";

describe("local PDF.js machine-text extraction", () => {
  it("extracts page-bound text without a network source", async () => {
    const extraction = await extractLocalPdfMachineText(
      pdfJsFixture("Synthetic PDF evidence"),
    );
    expect(extraction.status).toBe("success");
    expect(extraction.text).toContain("[Page 1]");
    expect(extraction.text).toContain("Synthetic PDF evidence");
    expect(extraction.metadata.pageCount).toBe(1);
  });

  it("fails closed for malformed PDF bytes", async () => {
    const extraction = await extractLocalPdfMachineText(
      new TextEncoder().encode("not a PDF"),
    );
    expect(extraction.status).toBe("unreadable");
    expect(extraction.text).toBe("");
  });

  it("feeds extracted PDF text into deterministic PII screening", async () => {
    const extraction = await extractLocalPdfMachineText(
      pdfJsFixture("Contact synthetic.person@example.test"),
    );
    const artifactSha256 = parseSha256("a".repeat(64));
    if (!artifactSha256.ok) throw new Error("Invalid fixture.");
    const screening = await screenSensitiveText(
      extraction.text,
      artifactSha256.value,
      {
        authorizedRealPii: false,
        expectedFields: [],
        maximumSensitiveMatches: 8,
      },
    );
    expect(screening.findings).toHaveLength(1);
    expect(screening.findings[0]?.category).toBe("unauthorized-pii");
    expect(screening.findings[0]?.blocksDownstream).toBe(true);
  });

  it("recovers exact page scopes from preserved machine text", () => {
    expect(
      splitPdfMachineTextPages("[Page 1]\nFirst\n\n[Page 2]\nSecond"),
    ).toEqual([
      { pageNumber: 1, text: "First" },
      { pageNumber: 2, text: "Second" },
    ]);
  });
});

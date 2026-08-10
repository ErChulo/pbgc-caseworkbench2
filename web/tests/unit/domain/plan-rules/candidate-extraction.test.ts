import { describe, expect, it } from "vitest";

import type { PassiveExtraction } from "../../../../src/adapters/parsers/passive-result";
import { parsePdfPassive } from "../../../../src/adapters/parsers/pdf-parser";
import {
  extractAdoptionDate,
  extractCandidates,
  extractEffectiveDate,
  extractProvisionCandidate,
  normalizeRestatement,
} from "../../../../src/domain/plan-rules/candidate-extraction";
import { multiPagePdfFixture } from "../../../fixtures/generators/passive-formats";

const sha = "a".repeat(64);
const openedAt = "2026-07-28T12:00:00.000Z";

function passive(
  parserId: string,
  mediaType: string,
  text: string,
  rawValues: readonly unknown[] = [],
  metadata: PassiveExtraction["metadata"] = {},
): PassiveExtraction {
  return {
    parserId,
    parserVersion: "1.0.0",
    status: "success",
    mediaType,
    text,
    metadata,
    rawValues,
    limitations: [],
    riskIndicators: [],
  };
}

describe("candidate extraction", () => {
  it.each([
    ["plain-text-passive", "text/plain", "text:line=1:offset=0"],
    [
      "ooxml-passive",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text:line=1:offset=0",
    ],
  ])(
    "preserves passive %s text verbatim and locates it",
    async (parserId, mediaType, locator) => {
      const verbatim = "Section 4.1  Benefit = 1.5% × Compensation";
      const result = await extractCandidates(
        sha,
        passive(parserId, mediaType, verbatim),
        { openedAt, sourceSection: "case-evidence" },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.candidates).toHaveLength(1);
      expect(result.value.candidates[0]?.verbatimText).toBe(verbatim);
      expect(result.value.candidates[0]?.artifactLocator).toBe(locator);
      expect(result.value.candidates[0]?.status).toBe("proposed");
    },
  );

  it("consumes PDF page spans without deriving or inventing locators", async () => {
    const parsed = parsePdfPassive(multiPagePdfFixture());
    const result = await extractCandidates(sha, parsed, {
      openedAt,
      sourceSection: "case-evidence",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.candidates.map((candidate) => ({
        locator: candidate.artifactLocator,
        verbatimText: candidate.verbatimText,
      })),
    ).toEqual([
      {
        locator: "pdf:page=1:offset=0:endOffset=35",
        verbatimText: "Section 4.1  Benefit = 1.5% of pay.",
      },
      {
        locator: "pdf:page=1:offset=36:endOffset=57",
        verbatimText: "Effective 2025-01-01.",
      },
      {
        locator: "pdf:page=2:offset=0:endOffset=19",
        verbatimText: "Adopted 2024-12-15.",
      },
    ]);
  });

  it("preserves PDF.js machine-text page boundaries in candidate locators", async () => {
    const firstPage = "Effective January 1, 2025, formula A applies.";
    const secondPage = "Formula B applies.";
    const result = await extractCandidates(
      sha,
      passive(
        "pdfjs-machine-text",
        "application/pdf",
        `[Page 1]\n${firstPage}\n\n[Page 2]\n${secondPage}`,
      ),
      { openedAt },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.candidates.map((candidate) => candidate.artifactLocator),
    ).toEqual([
      `pdf:page=1:offset=0:endOffset=${String(firstPage.length)}`,
      `pdf:page=2:offset=0:endOffset=${String(secondPage.length)}`,
    ]);
  });

  it("rejects PDF text without proven page spans", async () => {
    const result = await extractCandidates(
      sha,
      passive("pdf-passive", "application/pdf", "Unmapped text"),
      { openedAt },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_PASSIVE_OUTPUT" },
    });
  });

  it("extracts JSON string leaves with escaped JSON Pointers", async () => {
    const source = {
      "benefit/formula": "Effective January 1, 2025, benefit is 1.5%.",
    };
    const result = await extractCandidates(
      sha,
      passive("json-passive", "application/json", JSON.stringify(source), [
        source,
      ]),
      { openedAt },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates[0]).toMatchObject({
      artifactLocator: "/benefit~1formula",
      verbatimText: source["benefit/formula"],
      extractedEffectiveDate: "2025-01-01",
      dateExtractionConvention: "explicit",
    });
  });

  it("extracts delimited cells and workbook formula/stored values separately", async () => {
    const delimited = await extractCandidates(
      sha,
      passive("delimited-passive", "text/csv", "formula,value", [
        ["formula", "value"],
      ]),
      { openedAt },
    );
    expect(
      delimited.ok &&
        delimited.value.candidates.map(
          (candidate) => candidate.artifactLocator,
        ),
    ).toEqual(["row=1:column=1", "row=1:column=2"]);

    const workbook = await extractCandidates(
      sha,
      passive(
        "workbook-passive",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "",
        [
          {
            sheet: "Benefits",
            address: "B7",
            formulaText: "A7*0.015",
            storedValue: 1500,
            cellType: "n",
          },
        ],
      ),
      { openedAt },
    );
    expect(workbook.ok).toBe(true);
    if (!workbook.ok) return;
    expect(
      workbook.value.candidates.map((candidate) => [
        candidate.artifactLocator,
        candidate.verbatimText,
      ]),
    ).toEqual([
      ["sheet=Benefits:cell=B7:formula", "A7*0.015"],
      ["sheet=Benefits:cell=B7:stored-value", "1500"],
    ]);
    expect(workbook.value.unresolvedItems).toHaveLength(1);
    expect(
      workbook.value.unresolvedItems[0]?.competingInterpretations,
    ).toHaveLength(2);
  });

  it("splits formula and worked example text into separately located candidates", async () => {
    const result = await extractCandidates(
      sha,
      passive(
        "plain-text-passive",
        "text/plain",
        "Formula: benefit = pay * 0.015. Example: $100,000 * 0.015 = $1,500.",
      ),
      { openedAt },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.candidates.map((candidate) => candidate.verbatimText),
    ).toEqual([
      "Formula: benefit = pay * 0.015. ",
      "Example: $100,000 * 0.015 = $1,500.",
    ]);
    expect(
      result.value.candidates.map((candidate) => candidate.artifactLocator),
    ).toEqual([
      "text:line=1:offset=0:formula-offset=0",
      "text:line=1:offset=0:example-offset=32",
    ]);
    expect(result.value.unresolvedItems).toHaveLength(1);
    expect(result.value.authorityContexts[1]).toMatchObject({
      authority: "non-authoritative-example",
      eligibleForRuleAuthoring: false,
    });
  });

  it("emits explicit unresolved records for discretion, undefined terms, and conflicting dates", async () => {
    const text =
      "The Committee may, at its discretion, apply the undefined term. Effective 01/01/2024; effective 02/01/2024.";
    const result = await extractCandidates(
      sha,
      passive("plain-text-passive", "text/plain", text),
      {
        openedAt,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const candidate = result.value.candidates[0];
    expect(candidate?.status).toBe("unresolved");
    expect(candidate?.extractedEffectiveDate).toBeNull();
    expect(candidate?.linkedUnresolvedItemIds?.length).toBe(2);
    expect(result.value.unresolvedItems.map((item) => item.kind)).toEqual([
      "ambiguous-text",
      "undefined-term",
    ]);
    expect(
      result.value.unresolvedItems.every((item) => item.status === "open"),
    ).toBe(true);
  });

  it("marks metadata dates inferred and unresolved rather than treating them as explicit", async () => {
    const result = await extractCandidates(
      sha,
      passive(
        "plain-text-passive",
        "text/plain",
        "The accrued benefit is frozen.",
        [],
        {
          effectiveDate: "2020-07-31",
        },
      ),
      { openedAt },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates[0]).toMatchObject({
      extractedEffectiveDate: "2020-07-31",
      dateExtractionConvention: "inferred-from-context",
      status: "unresolved",
    });
    expect(result.value.unresolvedItems).toHaveLength(1);
  });

  it("records reference candidates as non-authoritative and override-required", async () => {
    const result = await extractCandidates(
      sha,
      passive(
        "plain-text-passive",
        "text/plain",
        "Benefit equals one percent of pay.",
      ),
      { openedAt, sourceSection: "reference-only" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates[0]?.status).toBe("proposed");
    expect(result.value.authorityContexts[0]).toMatchObject({
      authority: "non-authoritative-reference",
      authorityOverrideRequired: true,
      eligibleForRuleAuthoring: false,
    });
  });

  it("produces stable normalization, confidence, candidate IDs, and canonical SHA-256", async () => {
    const output = passive(
      "plain-text-passive",
      "text/plain",
      "Benefit\t equals   1.5% of compensation. Effective 2025-01-01.",
    );
    const first = await extractCandidates(sha, output, { openedAt });
    const second = await extractCandidates(sha, output, { openedAt });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.candidates).toEqual(second.value.candidates);
    expect(first.value.candidates[0]?.normalizedRestatement).toBe(
      "Benefit equals 1.5% of compensation. Effective 2025-01-01.",
    );
    expect(first.value.candidates[0]?.confidence).toBe(0.8);
    expect(first.value.candidates[0]?.candidateContentSha256).toMatch(
      /^[a-f0-9]{64}$/u,
    );
  });

  it("validates low-level candidate inputs without trimming verbatim text", async () => {
    const verbatimText = "  exact source text  ";
    const result = await extractProvisionCandidate({
      artifactSha256: sha,
      artifactLocator: "text:line=1:offset=0",
      provisionIdentifier: "line-1",
      verbatimText,
      normalizedRestatement: normalizeRestatement(verbatimText),
      extractedEffectiveDate: null,
      extractedAdoptionDate: null,
      dateExtractionConvention: "unknown",
      confidence: 0.7,
      classifierId: "test",
      classifierVersion: "1",
      ruleSetVersion: "test",
    });
    expect(result.ok && result.value.verbatimText).toBe(verbatimText);
  });

  it("extracts only labelled calendar dates", () => {
    expect(extractEffectiveDate("Effective February 29, 2024.").value).toBe(
      "2024-02-29",
    );
    expect(
      extractEffectiveDate("Effective February 29, 2023.").value,
    ).toBeNull();
    expect(extractAdoptionDate("Adopted: 12/15/2024").value).toBe("2024-12-15");
    expect(extractEffectiveDate("Example date 2024-01-01").value).toBeNull();
  });

  it("rejects failed passive outputs", async () => {
    const output = {
      ...passive("pdf-passive", "application/pdf", ""),
      status: "blocked" as const,
    };
    const result = await extractCandidates(sha, output, { openedAt });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_PASSIVE_OUTPUT" },
    });
  });
});

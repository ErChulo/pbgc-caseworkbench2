import { describe, expect, it } from "vitest";
import { createProvisionalSection436Memo } from "../../../../src/domain/section-436/provisional-memo";
import {
  createProvisionalSection436Preview,
  section436InputTemplate,
} from "../../../../src/domain/section-436/provisional-preview";
import { sha256Bytes } from "../../../../src/domain/shared/digest";
import {
  parseUtcTimestamp,
  parseUuid,
} from "../../../../src/domain/shared/types";

const caseResult = parseUuid("00000000-0000-4000-8000-000000000001");
const timeResult = parseUtcTimestamp("2026-11-06T00:00:00.000Z");
if (!caseResult.ok || !timeResult.ok) throw new Error("Bad fixture");
const caseId = caseResult.value,
  time = timeResult.value;
const encoder = new TextEncoder();

describe("provisional Section 436 review memo", () => {
  it("renders a blocked memo bound to the checked bytes and includes warnings and blockers", async () => {
    const source = encoder.encode(section436InputTemplate(caseId));
    const preview = await createProvisionalSection436Preview(
      source,
      caseId,
      time,
    );
    const memo = await createProvisionalSection436Memo(
      preview.bytes,
      source,
      caseId,
    );
    const text = new TextDecoder().decode(memo.bytes);
    expect(text).toContain(
      "PROVISIONAL SECTION 436 REVIEW MEMO — NOT APPROVED CASEWORK",
    );
    expect(text).toContain("Evaluation status: blocked (provisional)");
    expect(text).toContain("aftap-percentage");
    expect(text).toContain("No Section 436 rules were supplied");
    expect(text).toContain(
      `Input file SHA-256: ${preview.preview.sourceFileSha256}`,
    );
    expect(text).toContain(`Preview file SHA-256: ${preview.bytesSha256}`);
    expect(text).toContain(
      "END OF PROVISIONAL MEMO — NOT APPROVAL OR INDEPENDENT VALIDATION",
    );
    expect(memo.bytesSha256).toBe(await sha256Bytes(memo.bytes));
    const second = await createProvisionalSection436Memo(
      preview.bytes,
      source,
      caseId,
    );
    expect(second.bytes).toEqual(memo.bytes);
  });

  it("includes synthetic completed facts, rules, citations and explicitly unverified status without control-character injection", async () => {
    const citation = {
      artifactSha256: "a".repeat(64),
      sourceLocator: "synthetic\nFORGED HEADING\u202e",
      description: "Synthetic citation",
    };
    const fact = (factKey: string, value: string, valueKind: string) => ({
      factKey,
      value,
      valueKind,
      citations: [citation],
      reviewStatus: "human-approved",
    });
    const facts = [
      fact("aftap-percentage", "58.5", "decimal-percentage"),
      fact("plan-year-start", "2026-01-01", "date"),
      fact("plan-year-end", "2026-12-31", "date"),
      fact("certification-date", "2026-03-01", "date"),
    ];
    const rules = [
      {
        ruleId: "synthetic",
        description: "Synthetic only",
        operator: "less-than",
        aftapPercentageThreshold: "60",
        conclusionCode: "restriction-applies",
        limitationEffect: "Synthetic restriction",
        priority: 1,
        effectiveDate: "2026-01-01",
        citations: [citation],
        reviewStatus: "human-approved",
      },
    ];
    const source = encoder.encode(JSON.stringify({ caseId, facts, rules }));
    const preview = await createProvisionalSection436Preview(
      source,
      caseId,
      time,
    );
    const text = new TextDecoder().decode(
      (await createProvisionalSection436Memo(preview.bytes, source, caseId))
        .bytes,
    );
    expect(text).toContain("Evaluation status: completed (provisional)");
    expect(text).toContain("Conclusion code: restriction-applies");
    expect(text).toContain("Asserted review status: human-approved");
    expect(text).toContain("REVIEW STATUS IS ASSERTED, NOT VERIFIED");
    expect(text).toContain(`Source SHA-256: ${citation.artifactSha256}`);
    expect(text).toContain("synthetic\\nFORGED HEADING\\u{202E}");
    expect(text).not.toContain("\nFORGED HEADING");
    expect(text).not.toContain("\u202e");
  });

  it("renders values regenerated from original input even when preview JSON is Unicode-normalized", async () => {
    const citation = {
      artifactSha256: "b".repeat(64),
      sourceLocator: "synthetic",
      description: "Cafe\u0301",
    };
    const fact = {
      factKey: "aftap-percentage",
      value: "55",
      valueKind: "decimal-percentage",
      citations: [citation],
      reviewStatus: "provisional",
    };
    const source = encoder.encode(
      JSON.stringify({ caseId, facts: [fact], rules: [] }),
    );
    const preview = await createProvisionalSection436Preview(
      source,
      caseId,
      time,
    );
    expect(new TextDecoder().decode(preview.bytes)).toContain("Café");
    const memo = await createProvisionalSection436Memo(
      preview.bytes,
      source,
      caseId,
    );
    expect(new TextDecoder().decode(memo.bytes)).toContain("Cafe\u0301");
  });

  it("rejects wrong source and snapshots input buffers before async work", async () => {
    const source = encoder.encode(section436InputTemplate(caseId));
    const preview = await createProvisionalSection436Preview(
      source,
      caseId,
      time,
    );
    await expect(
      createProvisionalSection436Memo(
        preview.bytes,
        encoder.encode("{}"),
        caseId,
      ),
    ).rejects.toThrow(/input file hash/);
    const sourceCopy = new Uint8Array(source),
      previewCopy = new Uint8Array(preview.bytes);
    const pending = createProvisionalSection436Memo(
      previewCopy,
      sourceCopy,
      caseId,
    );
    previewCopy.fill(0);
    sourceCopy.fill(0);
    expect((await pending).verification.previewFileSha256).toBe(
      preview.bytesSha256,
    );
    await expect(
      createProvisionalSection436Memo(
        new Uint8Array(4 * 1024 * 1024 + 1),
        source,
        caseId,
      ),
    ).rejects.toThrow(/too large/);
  });
});

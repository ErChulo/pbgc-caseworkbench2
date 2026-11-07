import { describe, expect, it } from "vitest";
import {
  createProvisionalSection436Preview,
  section436InputTemplate,
} from "../../../../src/domain/section-436/provisional-preview";
import { verifySection436Replay } from "../../../../src/domain/section-436/replay-verification";
import {
  canonicalize,
  hashTyped,
} from "../../../../src/domain/manifests/canonical-json";
import { sha256Bytes } from "../../../../src/domain/shared/digest";
import {
  parseUtcTimestamp,
  parseUuid,
} from "../../../../src/domain/shared/types";

const id = parseUuid("00000000-0000-4000-8000-000000000001");
const timestamp = parseUtcTimestamp("2026-11-06T00:00:00.000Z");
if (!id.ok || !timestamp.ok) throw new Error("Invalid test fixture");
const caseId = id.value;
const time = timestamp.value;
const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));

describe("provisional Section 436 preview", () => {
  it("emits a blocked, replayable preview with byte and content hashes", async () => {
    const source = new TextEncoder().encode(section436InputTemplate(caseId));
    const result = await createProvisionalSection436Preview(
      source,
      caseId,
      time,
    );
    expect(result.preview.kind).toBe("provisional-section-436-preview");
    expect(
      result.preview.evaluation.deterministicPayload.evaluationStatus,
    ).toBe("blocked");
    expect(result.preview.sourceFileSha256).toBe(await sha256Bytes(source));
    expect(result.bytesSha256).toBe(await sha256Bytes(result.bytes));
    const { previewContentSha256, ...payload } = result.preview;
    expect(previewContentSha256).toBe(
      await hashTyped(payload, { typeName: "ProvisionalSection436Preview" }),
    );
    expect(new TextDecoder().decode(result.bytes)).toBe(
      `${canonicalize(result.preview)}\n`,
    );
    expect(
      (await verifySection436Replay(encode(result.preview.evaluation), caseId))
        .evaluationStatus,
    ).toBe("blocked");
    expect(result.preview.limitations.join(" ")).toContain("not verified");
  });

  it("preserves a completed synthetic calculation only as an unapproved preview", async () => {
    const citation = {
      artifactSha256: "a".repeat(64),
      sourceLocator: "synthetic:test",
      description: "Synthetic",
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
        description: "Synthetic",
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
    const result = await createProvisionalSection436Preview(
      encode({ caseId, facts, rules }),
      caseId,
      time,
    );
    expect(
      result.preview.evaluation.deterministicPayload.evaluationStatus,
    ).toBe("completed");
    expect(result.preview.limitations.join(" ")).toContain(
      "not independent validation",
    );
    expect(
      result.preview.evaluation.operationalMetadata.evaluatedBy,
    ).toBeNull();
  });

  it("snapshots the selected bytes before asynchronous hashing", async () => {
    const source = new TextEncoder().encode(section436InputTemplate(caseId));
    const expected = await sha256Bytes(source);
    const pending = createProvisionalSection436Preview(source, caseId, time);
    source.fill(0);
    const result = await pending;
    expect(result.preview.sourceFileSha256).toBe(expected);
    expect(
      result.preview.evaluation.deterministicPayload.evaluationStatus,
    ).toBe("blocked");
  });

  it("limits combined citations before contract validation", async () => {
    const citation = {
      artifactSha256: "a".repeat(64),
      sourceLocator: "test",
      description: "Synthetic",
    };
    const fact = {
      factKey: "aftap-percentage",
      value: "50",
      valueKind: "decimal-percentage",
      citations: Array(4001).fill(citation),
      reviewStatus: "provisional",
    };
    await expect(
      createProvisionalSection436Preview(
        encode({ caseId, facts: [fact], rules: [] }),
        caseId,
        time,
      ),
    ).rejects.toThrow(/size limits/);
  });

  it("rejects wrong case, unsupported fields, invalid UTF-8, malformed records and excessive input", async () => {
    for (const value of [
      null,
      [],
      { caseId: "00000000-0000-4000-8000-000000000002", facts: [], rules: [] },
      { caseId, facts: [], rules: [], approved: true },
      { caseId, facts: [{}], rules: [] },
      { caseId, facts: Array(501).fill({ citations: [] }), rules: [] },
    ]) {
      await expect(
        createProvisionalSection436Preview(encode(value), caseId, time),
      ).rejects.toThrow();
    }
    await expect(
      createProvisionalSection436Preview(new Uint8Array([0xff]), caseId, time),
    ).rejects.toThrow(/UTF-8/);
    await expect(
      createProvisionalSection436Preview(
        new Uint8Array(1024 * 1024 + 1),
        caseId,
        time,
      ),
    ).rejects.toThrow(/too large/);
  });
});

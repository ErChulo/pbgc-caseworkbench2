import { describe, expect, it } from "vitest";
import { evaluateSection436 } from "../../../../src/domain/section-436/evaluation";
import {
  MAX_SECTION_436_FILE_BYTES,
  verifySection436Replay,
} from "../../../../src/domain/section-436/replay-verification";
import { hashTyped } from "../../../../src/domain/manifests/canonical-json";
import { sha256Bytes } from "../../../../src/domain/shared/digest";
import {
  parseUtcTimestamp,
  parseUuid,
} from "../../../../src/domain/shared/types";

const caseId = parseUuid("00000000-0000-4000-8000-000000000001");
const otherId = parseUuid("00000000-0000-4000-8000-000000000002");
const timestamp = parseUtcTimestamp("2026-11-06T00:00:00.000Z");
if (!caseId.ok || !otherId.ok || !timestamp.ok) throw new Error("Bad fixture");
const active = caseId.value;
const evaluatedAt = timestamp.value;
const otherCaseId = otherId.value;
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
async function sample() {
  return evaluateSection436({
    caseId: active,
    facts: [],
    rules: [],
    evaluatedAt,
    evaluatedBy: null,
  });
}

describe("local Section 436 replay verification", () => {
  it("replays a blocked case and binds exact source bytes separately from content", async () => {
    const evaluation = await sample();
    const encoded = bytes(evaluation);
    const result = await verifySection436Replay(encoded, active);
    expect(result.evaluationStatus).toBe("blocked");
    expect(result.evaluationContentSha256).toBe(evaluation.contentSha256);
    expect(result.fileSha256).toBe(await sha256Bytes(encoded));
    const spaced = new TextEncoder().encode(
      JSON.stringify(evaluation, null, 2),
    );
    const other = await verifySection436Replay(spaced, active);
    expect(other.fileSha256).not.toBe(result.fileSha256);
    expect(other.evaluationContentSha256).toBe(result.evaluationContentSha256);
  });

  it("replays completed and inconclusive synthetic evaluations without asserting approval", async () => {
    const citation = {
      artifactSha256: "a".repeat(
        64,
      ) as import("../../../../src/domain/shared/types").Sha256,
      sourceLocator: "synthetic:test",
      description: "Synthetic authority",
    };
    const fact = (
      factKey: string,
      value: string,
      valueKind: "date" | "decimal-percentage",
    ) => ({
      factKey,
      value,
      valueKind,
      citations: [citation],
      reviewStatus: "human-approved" as const,
    });
    const facts = [
      fact("aftap-percentage", "58.5", "decimal-percentage"),
      fact("plan-year-start", "2026-01-01", "date"),
      fact("plan-year-end", "2026-12-31", "date"),
      fact("certification-date", "2026-03-01", "date"),
    ];
    const rule = {
      ruleId: "synthetic-rule",
      description: "Synthetic only",
      operator: "less-than" as const,
      aftapPercentageThreshold: "60",
      conclusionCode: "restriction-applies" as const,
      limitationEffect: "Synthetic restriction",
      priority: 1,
      effectiveDate: "2026-01-01",
      citations: [citation],
      reviewStatus: "human-approved" as const,
    };
    for (const [rules, status] of [
      [[rule], "completed"],
      [[{ ...rule, aftapPercentageThreshold: "50" }], "inconclusive"],
    ] as const) {
      const evaluation = await evaluateSection436({
        caseId: active,
        facts,
        rules,
        evaluatedAt,
        evaluatedBy: "synthetic",
      });
      expect(
        (await verifySection436Replay(bytes(evaluation), active))
          .evaluationStatus,
      ).toBe(status);
    }
  });

  it("rejects a different case, altered payload, and a self-rehashed false conclusion", async () => {
    const evaluation = await sample();
    await expect(
      verifySection436Replay(bytes(evaluation), otherCaseId),
    ).rejects.toThrow("active case");
    const payload = {
      ...evaluation.deterministicPayload,
      conclusionCode: "restriction-applies" as const,
      evaluationStatus: "completed" as const,
    };
    await expect(
      verifySection436Replay(
        bytes({ ...evaluation, deterministicPayload: payload }),
        active,
      ),
    ).rejects.toThrow("content hash");
    const forgedHash = await hashTyped(payload, {
      typeName: "Section436Evaluation",
    });
    await expect(
      verifySection436Replay(
        bytes({
          ...evaluation,
          deterministicPayload: payload,
          contentSha256: forgedHash,
        }),
        active,
      ),
    ).rejects.toThrow("local evaluator replay");
  });

  it("rejects invalid UTF-8, malformed and unsupported JSON, and size limits", async () => {
    await expect(
      verifySection436Replay(new Uint8Array([0xff]), active),
    ).rejects.toThrow("UTF-8 JSON");
    await expect(verifySection436Replay(bytes({}), active)).rejects.toThrow(
      "contract",
    );
    await expect(
      verifySection436Replay(new Uint8Array(0), active),
    ).rejects.toThrow("empty");
    await expect(
      verifySection436Replay(
        new Uint8Array(MAX_SECTION_436_FILE_BYTES + 1),
        active,
      ),
    ).rejects.toThrow("too large");
    const evaluation = await sample();
    const oversized = {
      ...evaluation,
      deterministicPayload: {
        ...evaluation.deterministicPayload,
        facts: Array(501).fill({ citations: [] }),
      },
    };
    await expect(
      verifySection436Replay(bytes(oversized), active),
    ).rejects.toThrow("size limits");
  });

  it("does not accept invalid metadata even though it is excluded from the content hash", async () => {
    const evaluation = await sample();
    const changed = {
      ...evaluation,
      operationalMetadata: {
        ...evaluation.operationalMetadata,
        evaluatedAt: "2026-01-01",
      },
    };
    await expect(
      verifySection436Replay(bytes(changed), active),
    ).rejects.toThrow();
  });
});

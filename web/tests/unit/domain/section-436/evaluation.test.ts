import { describe, expect, it } from "vitest";

import {
  evaluateSection436,
  renderSection436MarkdownReport,
} from "../../../../src/domain/section-436/evaluation";
import type {
  Section436Citation,
  Section436Fact,
  Section436Rule,
} from "../../../../src/domain/section-436/models";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Sha256,
  type UtcTimestamp,
  type Uuid,
} from "../../../../src/domain/shared/types";

describe("section 436 evaluation", () => {
  it("blocks when required facts are missing", async () => {
    const evaluation = await evaluateSection436({
      caseId: uuid("00000000-0000-4000-8000-000000000001"),
      facts: [],
      rules: [restrictionRule()],
      evaluatedAt: timestamp("2026-08-02T12:00:00.000Z"),
      evaluatedBy: "reviewer",
    });

    expect(evaluation.deterministicPayload.evaluationStatus).toBe("blocked");
    expect(evaluation.deterministicPayload.missingRequiredFacts).toContain(
      "aftap-percentage",
    );
    expect(evaluation.deterministicPayload.conclusionCode).toBe("blocked");
  });

  it("applies the first matching approved cited rule deterministically", async () => {
    const input = {
      caseId: uuid("00000000-0000-4000-8000-000000000001"),
      facts: completeFacts("58.5"),
      rules: [restrictionRule()],
      evaluatedAt: timestamp("2026-08-02T12:00:00.000Z"),
      evaluatedBy: "reviewer",
    };
    const first = await evaluateSection436(input);
    const second = await evaluateSection436({
      ...input,
      evaluatedAt: timestamp("2026-08-02T13:00:00.000Z"),
      evaluatedBy: "another-reviewer",
    });

    expect(first.deterministicPayload.evaluationStatus).toBe("completed");
    expect(first.deterministicPayload.conclusionCode).toBe(
      "restriction-applies",
    );
    expect(first.deterministicPayload.matchedRuleIds).toEqual([
      "436-aftap-under-60",
    ]);
    expect(first.contentSha256).toBe(second.contentSha256);
  });

  it("blocks provisional rules before producing a conclusion", async () => {
    const evaluation = await evaluateSection436({
      caseId: uuid("00000000-0000-4000-8000-000000000001"),
      facts: completeFacts("58.5"),
      rules: [{ ...restrictionRule(), reviewStatus: "provisional" }],
      evaluatedAt: timestamp("2026-08-02T12:00:00.000Z"),
      evaluatedBy: "reviewer",
    });

    expect(evaluation.deterministicPayload.evaluationStatus).toBe("blocked");
    expect(evaluation.deterministicPayload.blockedReasons).toContain(
      "All Section 436 rules must be human-approved before use.",
    );
  });

  it("renders a deterministic Markdown report from the evaluation artifact", async () => {
    const evaluation = await evaluateSection436({
      caseId: uuid("00000000-0000-4000-8000-000000000001"),
      facts: completeFacts("58.5"),
      rules: [restrictionRule()],
      evaluatedAt: timestamp("2026-08-02T12:00:00.000Z"),
      evaluatedBy: "reviewer",
    });

    const report = renderSection436MarkdownReport(evaluation);

    expect(report).toContain("# Section 436 Evaluation");
    expect(report).toContain("Conclusion: restriction-applies");
    expect(report).toContain(evaluation.contentSha256);
    expect(report).toBe(renderSection436MarkdownReport(evaluation));
  });
});

function completeFacts(aftap: string): readonly Section436Fact[] {
  return [
    fact("aftap-percentage", aftap, "decimal-percentage"),
    fact("plan-year-start", "2026-01-01", "date"),
    fact("plan-year-end", "2026-12-31", "date"),
    fact("certification-date", "2026-03-31", "date"),
  ];
}

function fact(
  factKey: string,
  value: string,
  valueKind: Section436Fact["valueKind"],
): Section436Fact {
  return {
    factKey,
    value,
    valueKind,
    citations: [citation()],
    reviewStatus: "human-approved",
  };
}

function restrictionRule(): Section436Rule {
  return {
    ruleId: "436-aftap-under-60",
    description: "Synthetic approved test rule for AFTAP below 60 percent.",
    operator: "less-than",
    aftapPercentageThreshold: "60",
    conclusionCode: "restriction-applies",
    limitationEffect: "Synthetic restriction result for testing.",
    priority: 1,
    effectiveDate: "2026-01-01",
    citations: [citation()],
    reviewStatus: "human-approved",
  };
}

function citation(): Section436Citation {
  return {
    artifactSha256: sha("a"),
    sourceLocator: "synthetic://section-436-test",
    description: "Synthetic cited authority for automated tests.",
  };
}

function uuid(value: string): Uuid {
  const parsed = parseUuid(value);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function sha(seed: string): Sha256 {
  const parsed = parseSha256(seed.repeat(64).slice(0, 64));
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function timestamp(value: string): UtcTimestamp {
  const parsed = parseUtcTimestamp(value);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

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

  it("blocks ambiguous facts, including an unresolved provisional alternative", async () => {
    const facts = [
      ...completeFacts("58.5"),
      {
        ...fact("aftap-percentage", "75", "decimal-percentage"),
        reviewStatus: "provisional" as const,
      },
    ];
    const result = await run(facts, [restrictionRule()]);
    expect(result.deterministicPayload.evaluationStatus).toBe("blocked");
    expect(result.deterministicPayload.blockedReasons.join(" ")).toContain(
      "Multiple Section 436 facts",
    );
    expect(result.deterministicPayload.limitationEffect).toBeNull();
  });

  it("blocks conflicting equal-priority matches but retains their lineage", async () => {
    const other = {
      ...restrictionRule(),
      ruleId: "other",
      conclusionCode: "no-restriction-identified" as const,
      limitationEffect: "Different result",
    };
    const result = await run(completeFacts("58.5"), [other, restrictionRule()]);
    expect(result.deterministicPayload.evaluationStatus).toBe("blocked");
    expect(result.deterministicPayload.matchedRuleIds).toEqual([
      "436-aftap-under-60",
      "other",
    ]);
    expect(result.deterministicPayload.blockedReasons.join(" ")).toContain(
      "same priority conflict",
    );
  });

  it("does not mark a rule requiring additional review as completed", async () => {
    const rule = {
      ...restrictionRule(),
      conclusionCode: "additional-review-required" as const,
    };
    const result = await run(completeFacts("58.5"), [rule]);
    expect(result.deterministicPayload.evaluationStatus).toBe("inconclusive");
    expect(result.deterministicPayload.conclusionCode).toBe(
      "additional-review-required",
    );
  });

  it("honors explicit differing priorities and blocks duplicate rule identities", async () => {
    const other = {
      ...restrictionRule(),
      ruleId: "other",
      priority: 2,
      conclusionCode: "no-restriction-identified" as const,
    };
    expect(
      (await run(completeFacts("58.5"), [other, restrictionRule()]))
        .deterministicPayload.conclusionCode,
    ).toBe("restriction-applies");
    const duplicate = { ...other, ruleId: restrictionRule().ruleId };
    expect(
      (await run(completeFacts("58.5"), [duplicate, restrictionRule()]))
        .deterministicPayload.evaluationStatus,
    ).toBe("blocked");
  });

  it("blocks bad fact kinds, dates, citations and unreviewed effective-date applicability", async () => {
    const wrongKind = completeFacts("58.5").map((f) =>
      f.factKey === "aftap-percentage"
        ? { ...f, valueKind: "text" as const }
        : f,
    );
    expect(
      (await run(wrongKind, [restrictionRule()])).deterministicPayload
        .evaluationStatus,
    ).toBe("blocked");
    const reversed = completeFacts("58.5").map((f) =>
      f.factKey === "plan-year-start" ? { ...f, value: "2027-01-01" } : f,
    );
    expect(
      (
        await run(reversed, [restrictionRule()])
      ).deterministicPayload.blockedReasons.join(" "),
    ).toContain("start must not be after");
    expect(
      (
        await run(completeFacts("58.5"), [
          { ...restrictionRule(), effectiveDate: "2026-02-01" },
        ])
      ).deterministicPayload.blockedReasons.join(" "),
    ).toContain("applicability");
    expect(
      (
        await run(completeFacts("58.5"), [
          {
            ...restrictionRule(),
            citations: [{ ...citation(), sourceLocator: " " }],
          },
        ])
      ).deterministicPayload.evaluationStatus,
    ).toBe("blocked");
  });

  it("compares bounded plain decimals exactly and rejects other numeric syntax", async () => {
    const rule = {
      ...restrictionRule(),
      aftapPercentageThreshold: "60.00000000000000000001",
    };
    expect(
      (await run(completeFacts("60"), [rule])).deterministicPayload
        .evaluationStatus,
    ).toBe("completed");
    expect(
      (await run(completeFacts("60.00000000000000000001"), [rule]))
        .deterministicPayload.evaluationStatus,
    ).toBe("inconclusive");
    for (const value of ["0x10", "1e2", "Infinity", " ", "9".repeat(129)]) {
      expect(
        (await run(completeFacts(value), [rule])).deterministicPayload
          .evaluationStatus,
      ).toBe("blocked");
    }
  });

  it("checks rule boundaries, priority and effective dates", async () => {
    const base = restrictionRule();
    expect(
      (
        await run(completeFacts("60.00"), [
          { ...base, operator: "less-than-or-equal" },
        ])
      ).deterministicPayload.evaluationStatus,
    ).toBe("completed");
    expect(
      (
        await run(completeFacts("-0.0"), [
          { ...base, operator: "equal", aftapPercentageThreshold: "0" },
        ])
      ).deterministicPayload.evaluationStatus,
    ).toBe("completed");
    expect(
      (await run(completeFacts("58"), [{ ...base, priority: 0 }]))
        .deterministicPayload.evaluationStatus,
    ).toBe("blocked");
    expect(
      (
        await run(completeFacts("58"), [
          { ...base, effectiveDate: "2026-02-30" },
        ])
      ).deterministicPayload.evaluationStatus,
    ).toBe("blocked");
  });

  it("does not freeze caller data or retain a mutable reference", async () => {
    const facts = [...completeFacts("58.5")];
    const rules = [restrictionRule()];
    const result = await run(facts, rules);
    expect(Object.isFrozen(facts[0])).toBe(false);
    facts[0] = fact("aftap-percentage", "99", "decimal-percentage");
    expect(
      result.deterministicPayload.facts.find(
        (f) => f.factKey === "aftap-percentage",
      )?.value,
    ).toBe("58.5");
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

function run(
  facts: readonly Section436Fact[],
  rules: readonly Section436Rule[],
) {
  return evaluateSection436({
    caseId: uuid("00000000-0000-4000-8000-000000000001"),
    facts,
    rules,
    evaluatedAt: timestamp("2026-08-02T12:00:00.000Z"),
    evaluatedBy: "synthetic-reviewer",
  });
}

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

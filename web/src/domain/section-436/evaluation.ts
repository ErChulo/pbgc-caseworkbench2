import { hashTyped } from "../manifests/canonical-json";
import { parseSha256 } from "../shared/types";
import type {
  Section436Citation,
  Section436DeterministicPayload,
  Section436Evaluation,
  Section436EvaluationInput,
  Section436Fact,
  Section436Rule,
} from "./models";

export const requiredSection436FactKeys = [
  "aftap-percentage",
  "plan-year-start",
  "plan-year-end",
  "certification-date",
] as const;

export async function evaluateSection436(
  input: Section436EvaluationInput,
): Promise<Section436Evaluation> {
  const facts = sortFacts(input.facts);
  const rules = sortRules(input.rules);
  const missingRequiredFacts = missingFacts(facts);
  const blockedReasons = blockingReasons(facts, rules, missingRequiredFacts);
  const aftap = factValue(facts, "aftap-percentage");
  const aftapPercent = aftap === null ? null : Number(aftap);
  const matchedRules =
    blockedReasons.length > 0 || aftapPercent === null
      ? []
      : rules.filter((rule) => ruleMatches(rule, aftapPercent));
  const governingRule = matchedRules[0] ?? null;
  const planYearStart = factValue(facts, "plan-year-start");
  const planYearEnd = factValue(facts, "plan-year-end");
  const evaluationStatus =
    blockedReasons.length > 0
      ? "blocked"
      : governingRule === null
        ? "inconclusive"
        : "completed";

  const deterministicPayload: Section436DeterministicPayload = deepFreeze({
    schemaVersion: "1.0.0",
    caseId: input.caseId,
    evaluationStatus,
    planYearStart,
    planYearEnd,
    facts,
    rules,
    missingRequiredFacts,
    matchedRuleIds: matchedRules.map((rule) => rule.ruleId).sort(),
    conclusionCode:
      evaluationStatus === "blocked"
        ? "blocked"
        : (governingRule?.conclusionCode ?? "additional-review-required"),
    limitationEffect:
      evaluationStatus === "blocked"
        ? null
        : (governingRule?.limitationEffect ??
          "No approved Section 436 rule matched the supplied facts."),
    citations: citationsFor(facts, matchedRules),
    blockedReasons,
  });

  const parsedHash = parseSha256(
    await hashTyped(deterministicPayload, { typeName: "Section436Evaluation" }),
  );
  if (!parsedHash.ok) throw new Error(parsedHash.error.message);

  return deepFreeze({
    schemaVersion: "1.0.0",
    artifactType: "section-436-evaluation",
    deterministicPayload,
    contentSha256: parsedHash.value,
    operationalMetadata: {
      evaluatedAt: input.evaluatedAt,
      evaluatedBy: input.evaluatedBy,
      engineVersion: "section-436-evaluator-v1.0.0",
    },
  });
}

export function renderSection436MarkdownReport(
  evaluation: Section436Evaluation,
): string {
  const payload = evaluation.deterministicPayload;
  const lines = [
    "# Section 436 Evaluation",
    "",
    `Case ID: ${payload.caseId}`,
    `Evaluation status: ${payload.evaluationStatus}`,
    `Conclusion: ${payload.conclusionCode}`,
    `Plan year: ${payload.planYearStart ?? "missing"} to ${payload.planYearEnd ?? "missing"}`,
    `Evaluation hash: ${evaluation.contentSha256}`,
    "",
    "## Limitation Effect",
    "",
    payload.limitationEffect ?? "No limitation effect was produced.",
    "",
    "## Missing Required Facts",
    "",
    ...listOrNone(payload.missingRequiredFacts),
    "",
    "## Blocked Reasons",
    "",
    ...listOrNone(payload.blockedReasons),
    "",
    "## Matched Rules",
    "",
    ...listOrNone(payload.matchedRuleIds),
    "",
    "## Citations",
    "",
    ...listOrNone(
      payload.citations.map(
        (citation) =>
          `${citation.description} (${citation.artifactSha256} ${citation.sourceLocator})`,
      ),
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function missingFacts(facts: readonly Section436Fact[]): readonly string[] {
  const available = new Set(
    facts
      .filter((fact) => fact.reviewStatus === "human-approved")
      .map((fact) => fact.factKey),
  );
  return requiredSection436FactKeys.filter(
    (factKey) => !available.has(factKey),
  );
}

function blockingReasons(
  facts: readonly Section436Fact[],
  rules: readonly Section436Rule[],
  missingRequiredFacts: readonly string[],
): readonly string[] {
  const reasons: string[] = [];
  for (const factKey of missingRequiredFacts) {
    reasons.push(`Missing human-approved Section 436 fact: ${factKey}.`);
  }
  if (rules.length === 0) {
    reasons.push("No Section 436 rules were supplied.");
  }
  if (rules.some((rule) => rule.reviewStatus !== "human-approved")) {
    reasons.push("All Section 436 rules must be human-approved before use.");
  }
  if (rules.some((rule) => rule.citations.length === 0)) {
    reasons.push("Every Section 436 rule must retain at least one citation.");
  }
  if (
    rules.some((rule) => !validDecimalPercentage(rule.aftapPercentageThreshold))
  ) {
    reasons.push(
      "Every Section 436 rule threshold must be a finite decimal percentage.",
    );
  }
  if (facts.some((fact) => fact.citations.length === 0)) {
    reasons.push(
      "Every supplied Section 436 fact must retain at least one citation.",
    );
  }
  const aftap = factValue(facts, "aftap-percentage");
  if (aftap !== null && !validDecimalPercentage(aftap)) {
    reasons.push("AFTAP percentage must be a finite decimal percentage.");
  }
  for (const factKey of [
    "plan-year-start",
    "plan-year-end",
    "certification-date",
  ]) {
    const value = factValue(facts, factKey);
    if (value !== null && !validIsoDate(value)) {
      reasons.push(`${factKey} must be a real ISO date.`);
    }
  }
  return reasons.sort();
}

function factValue(
  facts: readonly Section436Fact[],
  factKey: string,
): string | null {
  return (
    facts.find(
      (fact) =>
        fact.factKey === factKey && fact.reviewStatus === "human-approved",
    )?.value ?? null
  );
}

function ruleMatches(rule: Section436Rule, aftapPercent: number): boolean {
  const threshold = Number(rule.aftapPercentageThreshold);
  if (!Number.isFinite(threshold)) return false;
  switch (rule.operator) {
    case "less-than":
      return aftapPercent < threshold;
    case "less-than-or-equal":
      return aftapPercent <= threshold;
    case "greater-than-or-equal":
      return aftapPercent >= threshold;
    case "equal":
      return aftapPercent === threshold;
  }
}

function validDecimalPercentage(value: string): boolean {
  return (
    value.trim() === value && value !== "" && Number.isFinite(Number(value))
  );
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function listOrNone(values: readonly string[]): readonly string[] {
  return values.length === 0 ? ["- None"] : values.map((value) => `- ${value}`);
}

function citationsFor(
  facts: readonly Section436Fact[],
  rules: readonly Section436Rule[],
): readonly Section436Citation[] {
  const citations = [
    ...facts.flatMap((fact) => fact.citations),
    ...rules.flatMap((rule) => rule.citations),
  ];
  const seen = new Set<string>();
  return citations
    .filter((citation) => {
      const key = `${citation.artifactSha256}:${citation.sourceLocator}:${citation.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareCitation);
}

function sortFacts(
  facts: readonly Section436Fact[],
): readonly Section436Fact[] {
  return [...facts].sort(
    (left, right) =>
      left.factKey.localeCompare(right.factKey) ||
      left.value.localeCompare(right.value),
  );
}

function sortRules(
  rules: readonly Section436Rule[],
): readonly Section436Rule[] {
  return [...rules].sort(
    (left, right) =>
      left.priority - right.priority || left.ruleId.localeCompare(right.ruleId),
  );
}

function compareCitation(
  left: Section436Citation,
  right: Section436Citation,
): number {
  return (
    left.artifactSha256.localeCompare(right.artifactSha256) ||
    left.sourceLocator.localeCompare(right.sourceLocator) ||
    left.description.localeCompare(right.description)
  );
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

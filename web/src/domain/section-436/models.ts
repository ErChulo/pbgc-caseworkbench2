import type { Sha256, UtcTimestamp, Uuid } from "../shared/types";

export interface Section436Citation {
  readonly artifactSha256: Sha256;
  readonly sourceLocator: string;
  readonly description: string;
}

export interface Section436Fact {
  readonly factKey: string;
  readonly value: string;
  readonly valueKind: "date" | "decimal-percentage" | "text";
  readonly citations: readonly Section436Citation[];
  readonly reviewStatus: "human-approved" | "provisional";
}

export interface Section436Rule {
  readonly ruleId: string;
  readonly description: string;
  readonly operator:
    "less-than" | "less-than-or-equal" | "greater-than-or-equal" | "equal";
  readonly aftapPercentageThreshold: string;
  readonly conclusionCode:
    | "restriction-applies"
    | "no-restriction-identified"
    | "additional-review-required";
  readonly limitationEffect: string;
  readonly priority: number;
  readonly effectiveDate: string;
  readonly citations: readonly Section436Citation[];
  readonly reviewStatus: "human-approved" | "provisional";
}

export type Section436EvaluationStatus =
  "completed" | "blocked" | "inconclusive";

export interface Section436DeterministicPayload {
  readonly schemaVersion: "1.0.0";
  readonly caseId: Uuid;
  readonly evaluationStatus: Section436EvaluationStatus;
  readonly planYearStart: string | null;
  readonly planYearEnd: string | null;
  readonly facts: readonly Section436Fact[];
  readonly rules: readonly Section436Rule[];
  readonly missingRequiredFacts: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly conclusionCode:
    | "restriction-applies"
    | "no-restriction-identified"
    | "additional-review-required"
    | "blocked";
  readonly limitationEffect: string | null;
  readonly citations: readonly Section436Citation[];
  readonly blockedReasons: readonly string[];
}

export interface Section436Evaluation {
  readonly schemaVersion: "1.0.0";
  readonly artifactType: "section-436-evaluation";
  readonly deterministicPayload: Section436DeterministicPayload;
  readonly contentSha256: Sha256;
  readonly operationalMetadata: {
    readonly evaluatedAt: UtcTimestamp;
    readonly evaluatedBy: string | null;
    readonly engineVersion: "section-436-evaluator-v1.0.0";
  };
}

export interface Section436EvaluationInput {
  readonly caseId: Uuid;
  readonly facts: readonly Section436Fact[];
  readonly rules: readonly Section436Rule[];
  readonly evaluatedAt: UtcTimestamp;
  readonly evaluatedBy: string | null;
}

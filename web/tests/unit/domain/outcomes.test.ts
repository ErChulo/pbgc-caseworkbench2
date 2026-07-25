import { describe, expect, it } from "vitest";

import type {
  DomainError,
  PartialPackageOutcome,
  UnresolvedItem,
  ValidationResult,
} from "../../../src/domain/shared/outcomes";
import { parseSha256 } from "../../../src/domain/shared/types";

const sha256 = parseSha256("a".repeat(64));
if (!sha256.ok) throw new Error("Synthetic SHA-256 must be valid.");

describe("T024 structured domain outcomes", () => {
  it("represents non-sensitive structured errors", () => {
    const error: DomainError = {
      code: "SYNTHETIC_READ_FAILURE",
      category: "storage",
      severity: "error",
      safeMessage: "The synthetic artifact could not be read.",
      blocksDownstream: true,
      subjectKey: "artifact:synthetic",
      affectedArtifactSha256: sha256.value,
      retryable: true,
    };

    expect(error).toMatchObject({
      code: "SYNTHETIC_READ_FAILURE",
      blocksDownstream: true,
      retryable: true,
    });
    expect(error).not.toHaveProperty("cause");
  });

  it("requires fail-closed validation outcomes to block downstream use", () => {
    const result: ValidationResult = {
      validationKey: "synthetic-validation",
      subjectKey: "artifact:synthetic",
      findingCode: "SYNTHETIC_UNSUPPORTED",
      checkDefinitionId: "synthetic-check",
      checkDefinitionVersion: "1.0.0",
      outcome: "unsupported",
      severity: "warning",
      evidence: [],
      limitations: ["Synthetic format is unsupported."],
      blocksDownstream: true,
      affectedArtifactSha256: sha256.value,
      ruleSetVersion: "1.0.0",
      deterministicResultPayload: null,
    };

    expect(result.outcome).toBe("unsupported");
    expect(result.blocksDownstream).toBe(true);
  });

  it("keeps unresolved source records provisional", () => {
    const item: UnresolvedItem = {
      itemKey: "synthetic-unresolved",
      scope: { kind: "artifact" },
      subjectKeys: ["artifact:synthetic"],
      issueType: "missing-input",
      evidence: [],
      competingPossibilities: [],
      downstreamConsequence: "Synthetic processing remains blocked.",
      responsibleQueueOrReviewer: null,
      status: "open",
    };

    expect(item.status).toBe("open");
  });

  it("prevents human-final states on unresolved source records at compile time", () => {
    const invalidStatus: UnresolvedItem = {
      itemKey: "synthetic-invalid",
      scope: {},
      subjectKeys: ["artifact:synthetic"],
      issueType: "ambiguity",
      evidence: [],
      competingPossibilities: [],
      downstreamConsequence: "Requires review.",
      responsibleQueueOrReviewer: null,
      // @ts-expect-error Human-final state is derived from decision replay.
      status: "resolved",
    };

    expect(invalidStatus.status).toBe("resolved");
  });

  it("keeps package and artifact outcomes independently visible", () => {
    const outcome: PartialPackageOutcome = {
      status: "partial",
      artifactOutcomes: [
        {
          artifactSha256: sha256.value,
          status: "completed",
          blocksDownstream: false,
          errors: [],
          limitations: [],
        },
      ],
      counts: {
        discovered: 2,
        completed: 1,
        blocked: 1,
        failed: 0,
        pending: 0,
      },
      errors: [],
      limitations: [],
      unaffectedArtifactsMayContinue: true,
    };

    expect(outcome.status).toBe("partial");
    expect(outcome.artifactOutcomes).toHaveLength(1);
    expect(outcome.unaffectedArtifactsMayContinue).toBe(true);
  });
});

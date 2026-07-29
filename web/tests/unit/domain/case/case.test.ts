import { describe, expect, it } from "vitest";

import {
  createCase,
  type CaseCreationDependencies,
} from "../../../../src/domain/case/case";
import { validateCaseIdentifier } from "../../../../src/domain/case/case-identifier";
import {
  parseUtcTimestamp,
  parseUuid,
} from "../../../../src/domain/shared/types";

const UUID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-07-25T15:00:00.000Z";

function dependencies(): CaseCreationDependencies {
  const uuid = parseUuid(UUID);
  const now = parseUtcTimestamp(NOW);
  if (!uuid.ok || !now.ok)
    throw new Error("Synthetic identity fixture invalid.");
  return {
    uuid: { generate: () => uuid.value },
    clock: { now: () => now.value },
  };
}

const reviewer = {
  actorType: "human",
  actorKey: "synthetic-reviewer",
  displayName: "Synthetic Reviewer",
  authorityContext: "case-intake",
} as const;

describe("T030 immutable Case model", () => {
  it("creates a production case with separate immutable identities and provenance", () => {
    const result = createCase(
      {
        authoritativeCaseId: "PBGC-SYNTHETIC-001",
        purpose: "production",
        designationRationale: null,
        createdBy: reviewer,
      },
      dependencies(),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        caseId: UUID,
        authoritativeCaseId: "PBGC-SYNTHETIC-001",
        purpose: "production",
        designationRationale: null,
        createdBy: reviewer,
        createdAt: NOW,
        collisionDecisionId: null,
        status: "active",
        statusHistory: [],
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(
      Reflect.set(
        result.value,
        "caseId",
        "22222222-2222-4222-8222-222222222222",
      ),
    ).toBe(false);
    expect(result.value.caseId).toBe(UUID);
  });

  it("requires an authoritative identifier for production", () => {
    const result = createCase(
      {
        authoritativeCaseId: null,
        purpose: "production",
        designationRationale: null,
        createdBy: reviewer,
      },
      dependencies(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Production creation unexpectedly passed.");
    expect(result.error.code).toBe("PRODUCTION_CASE_IDENTIFIER_REQUIRED");
  });

  it.each(["test", "training", "duplicate-investigation"] as const)(
    "creates an explicitly designated %s case without representing it as production",
    (purpose) => {
      const result = createCase(
        {
          authoritativeCaseId: "PBGC-SYNTHETIC-001",
          purpose,
          designationRationale: `Synthetic ${purpose} purpose.`,
          createdBy: reviewer,
        },
        dependencies(),
      );

      expect(result).toMatchObject({
        ok: true,
        value: {
          purpose,
          designationRationale: `Synthetic ${purpose} purpose.`,
        },
      });
    },
  );

  it("rejects a purpose outside the governed case-purpose vocabulary", () => {
    const result = createCase(
      {
        authoritativeCaseId: "PBGC-SYNTHETIC-001",
        purpose: "demonstration",
        designationRationale: "Synthetic invalid purpose.",
        createdBy: reviewer,
      } as never,
      dependencies(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Invalid case purpose unexpectedly passed.");
    expect(result.error.code).toBe("INVALID_CASE_PURPOSE");
  });

  it("applies only the explicitly configured non-case-specific identifier rule", () => {
    const rule = {
      ruleId: "synthetic-rule",
      ruleVersion: "1.0.0",
      minimumLength: 3,
      maximumLength: 32,
      syntax: /^[A-Z0-9-]+$/u,
      unicodeNormalization: "NFC",
      letterCase: "uppercase",
    } as const;

    expect(validateCaseIdentifier("pbgc-synthetic-001", rule)).toEqual({
      ok: true,
      value: {
        value: "PBGC-SYNTHETIC-001",
        ruleId: "synthetic-rule",
        ruleVersion: "1.0.0",
      },
    });
    const padded = validateCaseIdentifier(" PBGC-SYNTHETIC-001", rule);
    expect(padded.ok).toBe(false);
    if (padded.ok) throw new Error("Padded identifier unexpectedly passed.");
    expect(padded.error.code).toBe("CASE_IDENTIFIER_PADDED");
  });

  it("rejects non-production creation without an explicit designation rationale", () => {
    const result = createCase(
      {
        authoritativeCaseId: null,
        purpose: "training",
        designationRationale: " ",
        createdBy: reviewer,
      },
      dependencies(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Training creation unexpectedly passed.");
    expect(result.error.code).toBe("NON_PRODUCTION_RATIONALE_REQUIRED");
  });

  it("contains no case-specific plan, employer, participant, or reference defaults", () => {
    const result = createCase(
      {
        authoritativeCaseId: "PBGC-SYNTHETIC-999",
        purpose: "production",
        designationRationale: null,
        createdBy: reviewer,
      },
      dependencies(),
    );

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/24884900|st[ .-]?rose/iu);
    if (result.ok) {
      expect(Object.keys(result.value).sort()).toEqual([
        "authoritativeCaseId",
        "caseId",
        "collisionDecisionId",
        "createdAt",
        "createdBy",
        "designationRationale",
        "purpose",
        "status",
        "statusHistory",
      ]);
    }
  });
});

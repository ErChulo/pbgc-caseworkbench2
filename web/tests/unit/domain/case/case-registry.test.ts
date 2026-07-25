import { describe, expect, it } from "vitest";

import {
  CaseRegistry,
  type CaseRegistryDependencies,
} from "../../../../src/domain/case/case-registry";
import {
  parseUtcTimestamp,
  parseUuid,
} from "../../../../src/domain/shared/types";

const UUIDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
] as const;
const NOW = "2026-07-25T15:00:00.000Z";
const reviewer = {
  actorType: "human",
  actorKey: "synthetic-reviewer",
  displayName: "Synthetic Reviewer",
  authorityContext: "case-collision-review",
} as const;

function dependencies(): CaseRegistryDependencies {
  const values = UUIDS.map((value) => parseUuid(value));
  const now = parseUtcTimestamp(NOW);
  if (values.some((value) => !value.ok) || !now.ok) {
    throw new Error("Synthetic registry fixtures invalid.");
  }
  let index = 0;
  return {
    uuid: {
      generate: () => {
        const value = values[index++];
        if (!value?.ok) throw new Error("Synthetic UUID fixture exhausted.");
        return value.value;
      },
    },
    clock: { now: () => now.value },
  };
}

function createProduction(registry: CaseRegistry) {
  return registry.create({
    authoritativeCaseId: "PBGC-SYNTHETIC-001",
    purpose: "production",
    designationRationale: null,
    createdBy: reviewer,
  });
}

describe("T031 authoritative case identifier registry", () => {
  it("stops duplicate production creation and presents the existing case", () => {
    const registry = new CaseRegistry(dependencies());
    const created = createProduction(registry);
    const duplicate = createProduction(registry);

    expect(created.kind).toBe("created");
    expect(duplicate).toMatchObject({
      kind: "collision",
      existingCase: {
        caseId: UUIDS[0],
        authoritativeCaseId: "PBGC-SYNTHETIC-001",
        status: "active",
      },
    });
    expect(registry.cases()).toHaveLength(1);
  });

  it("presents a closed existing case without silently reopening or duplicating it", () => {
    const initialRegistry = new CaseRegistry(dependencies());
    const created = createProduction(initialRegistry);
    if (created.kind !== "created")
      throw new Error("Synthetic case not created.");
    const registry = new CaseRegistry(dependencies(), [
      Object.freeze({ ...created.caseRecord, status: "closed" }),
    ]);

    const duplicate = createProduction(registry);

    expect(duplicate).toMatchObject({
      kind: "collision",
      existingCase: { caseId: UUIDS[0], status: "closed" },
    });
    expect(registry.cases()).toHaveLength(1);
  });

  it("records an explicit human resume-existing decision linked to the original UUID", () => {
    const registry = new CaseRegistry(dependencies());
    const created = createProduction(registry);
    if (created.kind !== "created")
      throw new Error("Synthetic case not created.");
    const collision = createProduction(registry);
    if (collision.kind !== "collision")
      throw new Error("Collision not detected.");

    const resolved = registry.resolveCollision(collision, {
      action: "resume-existing",
      actor: reviewer,
      rationale: "Continue controlled intake in the existing synthetic case.",
      nonProductionPurpose: null,
    });

    expect(resolved).toMatchObject({
      ok: true,
      value: {
        kind: "resumed-existing",
        linkedCaseId: created.caseRecord.caseId,
        decision: {
          action: "resume-existing",
          actor: reviewer,
          decidedAt: NOW,
        },
      },
    });
    expect(registry.cases()).toHaveLength(1);
    expect(registry.collisionHistory()).toHaveLength(1);
  });

  it.each(["test", "training", "duplicate-investigation"] as const)(
    "records human approval before creating a separate %s case",
    (purpose) => {
      const registry = new CaseRegistry(dependencies());
      createProduction(registry);
      const collision = createProduction(registry);
      if (collision.kind !== "collision")
        throw new Error("Collision not detected.");

      const resolved = registry.resolveCollision(collision, {
        action: "create-non-production",
        actor: reviewer,
        rationale: `Approved synthetic ${purpose} case.`,
        nonProductionPurpose: purpose,
      });

      expect(resolved).toMatchObject({
        ok: true,
        value: {
          kind: "created-non-production",
          caseRecord: {
            caseId: UUIDS[2],
            purpose,
            collisionDecisionId: UUIDS[1],
          },
          decision: {
            decisionId: UUIDS[1],
            actor: reviewer,
            resultingCaseId: UUIDS[2],
          },
        },
      });
      expect(registry.cases()).toHaveLength(2);
      expect(registry.collisionHistory()).toHaveLength(1);
    },
  );
});

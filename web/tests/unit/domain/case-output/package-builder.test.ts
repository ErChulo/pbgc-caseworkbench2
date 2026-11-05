import { describe, expect, it } from "vitest";

import {
  buildFinalCaseworkOutputPayload,
  createFinalCaseworkOutputPackage,
} from "../../../../src/domain/case-output/package-builder";
import type {
  CaseworkOutputArtifactInput,
  FinalCaseworkOutputInput,
} from "../../../../src/domain/case-output/models";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Sha256,
  type UtcTimestamp,
  type Uuid,
} from "../../../../src/domain/shared/types";

describe("final casework output package builder", () => {
  it("blocks every missing required final-output stage", () => {
    const payload = buildFinalCaseworkOutputPayload(blockedInput());

    expect(payload.packageStatus).toBe("blocked");
    expect(stage(payload, "workbook")?.blockers).toContain(
      "No generated V1 workbook artifact is available.",
    );
    expect(stage(payload, "section-436")?.blockers).toContain(
      "Section 436 is required but no evaluation artifact is available.",
    );
    expect(
      payload.maturityClaims.some((claim) => claim.externalExecutionClaimed),
    ).toBe(false);
  });

  it("keeps deterministic package hash stable when only operational metadata changes", async () => {
    const first = await createFinalCaseworkOutputPackage({
      ...completeInput(),
      createdAt: timestamp("2026-08-02T12:00:00.000Z"),
      createdBy: "reviewer-a",
    });
    const second = await createFinalCaseworkOutputPackage({
      ...completeInput(),
      createdAt: timestamp("2026-08-02T13:00:00.000Z"),
      createdBy: "reviewer-b",
    });

    expect(first.contentSha256).toBe(second.contentSha256);
    expect(first.operationalMetadata).not.toEqual(second.operationalMetadata);
  });

  it("does not treat references as validated final output or proven lineage", () => {
    const input = completeInput();
    const payload = buildFinalCaseworkOutputPayload({
      ...input,
      reconciliation: artifact("reconciliation-result", "reconciliation", "3"),
      workbook: {
        ...artifact("v1-workbook", "workbook", "1"),
        maturityLevel: "externally-executed",
      },
    });
    expect(payload.packageStatus).toBe("blocked");
    expect(stage(payload, "validation-reconciliation")?.blockers).toContain(
      "Referenced artifacts and their lineage have not been verified for final output.",
    );
    expect(payload.lineage).toEqual([]);
    expect(
      payload.maturityClaims.some((claim) => claim.externalExecutionClaimed),
    ).toBe(false);
    expect(stage(payload, "workbook")?.maturityLevel).toBe("implemented");
  });

  it("requires both validation and reconciliation", () => {
    const payload = buildFinalCaseworkOutputPayload(completeInput());
    expect(stage(payload, "validation-reconciliation")?.blockers).toContain(
      "No reconciliation evidence artifact is available.",
    );
    expect(stage(payload, "section-436")?.status).toBe("not-required");
  });

  it.each(["open", "assigned", "reopened", "unknown"])(
    "blocks unresolved item status %s",
    (status) => {
      const payload = buildFinalCaseworkOutputPayload({
        ...completeInput(),
        unresolvedItems: [
          {
            itemId: "item",
            scope: "plan",
            downstreamConsequence: "review",
            status,
          },
        ],
      });
      expect(stage(payload, "plan-rules")?.status).toBe("blocked");
    },
  );

  it.each(["resolved", "superseded"])("does not block a %s item", (status) => {
    const payload = buildFinalCaseworkOutputPayload({
      ...completeInput(),
      unresolvedItems: [
        {
          itemId: "item",
          scope: "plan",
          downstreamConsequence: "review",
          status,
        },
      ],
    });
    expect(stage(payload, "plan-rules")?.status).toBe("ready");
  });
});

function blockedInput(): FinalCaseworkOutputInput {
  return {
    caseId: uuid("00000000-0000-4000-8000-000000000001"),
    evidenceManifestSha256: sha("a"),
    planRules: [],
    populationProfileContentSha256: null,
    architecture: null,
    buildSpec: null,
    compiledFormulas: null,
    workbook: null,
    validation: null,
    reconciliation: null,
    section436: null,
    section436Required: true,
    unresolvedItems: [],
    createdAt: timestamp("2026-08-02T12:00:00.000Z"),
    createdBy: null,
  };
}

function completeInput(): FinalCaseworkOutputInput {
  return {
    caseId: uuid("00000000-0000-4000-8000-000000000001"),
    evidenceManifestSha256: sha("a"),
    planRules: [
      {
        ruleId: "00000000-0000-4000-8000-000000000010",
        ruleContentSha256: sha("b"),
        reviewStatus: "human-approved",
      },
    ],
    populationProfileContentSha256: sha("c"),
    architecture: artifact("v1-architecture", "architecture", "d"),
    buildSpec: artifact("build-spec", "build-spec", "e"),
    compiledFormulas: artifact(
      "compiled-formula-artifact",
      "compiled-formulas",
      "f",
    ),
    workbook: artifact("v1-workbook", "workbook", "1"),
    validation: artifact("validation-result", "validation", "2"),
    reconciliation: null,
    section436: null,
    section436Required: false,
    unresolvedItems: [],
    createdAt: timestamp("2026-08-02T12:00:00.000Z"),
    createdBy: null,
  };
}

function artifact(
  artifactType: CaseworkOutputArtifactInput["artifactType"],
  artifactId: string,
  hashSeed: string,
): CaseworkOutputArtifactInput {
  return {
    artifactType,
    artifactId,
    contentSha256: sha(hashSeed),
    mediaType: "application/json",
    description: artifactId,
  };
}

function stage(
  payload: ReturnType<typeof buildFinalCaseworkOutputPayload>,
  stageKey: string,
) {
  return payload.stages.find((candidate) => candidate.stageKey === stageKey);
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

import { describe, expect, it } from "vitest";
import { validateContract } from "../../../../src/contracts/schema-validator";

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
      "No unambiguous generated V1 workbook artifact is available.",
    );
    expect(stage(payload, "section-436")?.blockers).toContain(
      "Section 436 is required but no unambiguous evaluation artifact is available.",
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
    expect(stage(payload, "workbook")?.maturityLevel).toBe("specified");
    expect(stage(payload, "workbook")?.status).toBe("blocked");
  });

  it("requires both validation and reconciliation", () => {
    const payload = buildFinalCaseworkOutputPayload(completeInput());
    expect(stage(payload, "validation-reconciliation")?.blockers).toContain(
      "No unambiguous reconciliation evidence artifact is available.",
    );
    expect(stage(payload, "section-436")?.status).toBe("blocked");
    expect(payload.section436Required).toBe(true);
    expect(stage(payload, "section-436")?.blockers.join(" ")).toContain(
      "non-applicability has not been verified",
    );
  });

  it("exports a schema-valid blocked report when non-applicability was asserted without evidence", async () => {
    const report = await createFinalCaseworkOutputPackage(completeInput());
    expect(report.deterministicPayload.section436Required).toBe(true);
    expect(report.deterministicPayload.packageStatus).toBe("blocked");
    const validation = validateContract("finalCaseworkOutputPackage", report);
    expect(validation).toEqual({ valid: true, issues: [] });
  });

  it("does not mark any stage ready solely from asserted references and labels", () => {
    const payload = buildFinalCaseworkOutputPayload({
      ...completeInput(),
      reconciliation: artifact("reconciliation-result", "reconciliation", "3"),
      section436Required: true,
      section436: artifact("section-436-evaluation", "evaluation", "4"),
    });
    expect(
      payload.stages.every(
        (item) => item.required && item.status === "blocked",
      ),
    ).toBe(true);
    expect(payload.stages.every((item) => item.blockers.length > 0)).toBe(true);
    expect(
      payload.maturityClaims.every((claim) => claim.level === "specified"),
    ).toBe(true);
  });

  it("does not treat a Section 436 reference as a verified completed evaluation", () => {
    const payload = buildFinalCaseworkOutputPayload({
      ...completeInput(),
      section436Required: true,
      section436: artifact("section-436-evaluation", "evaluation", "4"),
    });
    const section = stage(payload, "section-436");
    expect(section?.status).toBe("blocked");
    expect(section?.artifactSha256Values).toEqual([sha("4")]);
    expect(section?.blockers.join(" ")).toContain("has not been verified");
    expect(
      payload.maturityClaims.find((claim) => claim.subject === "section-436")
        ?.level,
    ).toBe("specified");
  });

  it("does not freeze or retain caller-owned unresolved item records", () => {
    const item = {
      itemId: "item",
      scope: "plan",
      downstreamConsequence: "review",
      status: "open",
    };
    const payload = buildFinalCaseworkOutputPayload({
      ...completeInput(),
      unresolvedItems: [item],
    });
    expect(Object.isFrozen(item)).toBe(false);
    item.status = "resolved";
    expect(payload.unresolvedItems[0]?.status).toBe("open");
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
    expect(stage(payload, "plan-rules")?.blockers).toEqual([
      "Stage readiness is not verified by references alone.",
    ]);
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

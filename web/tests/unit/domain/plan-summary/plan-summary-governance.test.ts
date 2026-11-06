import { describe, expect, it } from "vitest";
import {
  addPlanSummaryAttribute,
  approvePlanSummaryAttribute,
  createEmptyPlanSummaryRecord,
  detectConflicts,
  promotePlanSummaryToPreliminary,
} from "../../../../src/domain/plan-summary/plan-summary-governance";
import { hashTyped } from "../../../../src/domain/manifests/canonical-json";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
} from "../../../../src/domain/shared/types";

function fixture() {
  const caseId = parseUuid("00000000-0000-4000-8000-000000000001");
  const timestamp = parseUtcTimestamp("2026-01-01T00:00:00Z");
  const sha = parseSha256("a".repeat(64));
  if (!caseId.ok || !timestamp.ok || !sha.ok)
    throw new Error("Invalid fixture");
  let sequence = 1;
  const deps = {
    uuid: {
      generate: () => {
        sequence += 1;
        const id = parseUuid(
          `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
        );
        if (!id.ok) throw new Error("Invalid fixture UUID");
        return id.value;
      },
    },
    clock: { now: () => timestamp.value },
  };
  const reviewer = {
    actorType: "human" as const,
    actorKey: "synthetic",
    displayName: "Synthetic",
    authorityContext: "synthetic test",
  };
  const citation = {
    artifactSha256: sha.value,
    artifactLocator: "synthetic",
    sourceRole: "approved-plan-summary" as const,
    sectionReference: "1",
    pageReference: null,
  };
  return { caseId: caseId.value, deps, reviewer, citation };
}

async function proposed() {
  const f = fixture();
  const empty = await createEmptyPlanSummaryRecord(f.caseId, f.deps);
  const record = await addPlanSummaryAttribute(
    empty,
    "A",
    "synthetic.field",
    "value",
    "direct",
    [f.citation],
    null,
    null,
    null,
    f.reviewer,
    f.deps,
  );
  const attribute = record.sections[0]?.attributes[0];
  if (!attribute) throw new Error("Missing fixture attribute");
  return { ...f, empty, record, attribute };
}

describe("Plan Summary integrity and governance", () => {
  it("uses the same attribute identity in its content hash and supports verified transitions", async () => {
    const f = await proposed();
    const a = f.attribute;
    const expected = await hashTyped(
      {
        attributeId: a.attributeId,
        sectionId: a.sectionId,
        fieldPath: a.fieldPath,
        fieldValue: a.fieldValue,
        source: a.source,
        citations: a.citations,
        effectiveDate: a.effectiveDate,
        adoptionDate: a.adoptionDate,
        phaseInPercentage: a.phaseInPercentage,
      },
      { typeName: "PlanSummaryAttribute" },
    );
    expect(a.attributeContentSha256).toBe(expected);
    const approved = await approvePlanSummaryAttribute(
      f.record,
      a.attributeId,
      "value",
      f.citation,
      "Synthetic rationale",
      f.reviewer,
      f.deps,
    );
    expect(approved.record.sections[0]?.attributes[0]?.status).toBe("approved");
    const checked = await detectConflicts(approved.record);
    const preliminary = await promotePlanSummaryToPreliminary(
      checked,
      f.reviewer,
      f.deps,
    );
    expect(preliminary.overallStatus).toBe("preliminary");
    await expect(
      addPlanSummaryAttribute(
        preliminary,
        "A",
        "second.field",
        "value",
        "direct",
        [f.citation],
        null,
        null,
        null,
        f.reviewer,
        f.deps,
      ),
    ).rejects.toThrow(/draft/u);
    await expect(
      approvePlanSummaryAttribute(
        approved.record,
        a.attributeId,
        "value",
        null,
        "reason",
        f.reviewer,
        f.deps,
      ),
    ).rejects.toThrow(/proposed/u);
  });
  it("blocks empty, altered, duplicate, unsupported and unreviewed records", async () => {
    const f = await proposed();
    await expect(
      promotePlanSummaryToPreliminary(f.empty, f.reviewer, f.deps),
    ).rejects.toThrow();
    await expect(
      promotePlanSummaryToPreliminary(f.record, f.reviewer, f.deps),
    ).rejects.toThrow();
    await expect(
      addPlanSummaryAttribute(
        f.record,
        "A",
        "synthetic.field",
        "other",
        "direct",
        [f.citation],
        null,
        null,
        null,
        f.reviewer,
        f.deps,
      ),
    ).rejects.toThrow(/supersession/u);
    await expect(
      approvePlanSummaryAttribute(
        f.record,
        f.attribute.attributeId,
        "value",
        { ...f.citation, artifactLocator: "different" },
        "reason",
        f.reviewer,
        f.deps,
      ),
    ).rejects.toThrow(/citation/u);
    await expect(
      approvePlanSummaryAttribute(
        f.record,
        f.attribute.attributeId,
        "other",
        null,
        "reason",
        f.reviewer,
        f.deps,
      ),
    ).rejects.toThrow(/exact proposed/u);
    await expect(
      approvePlanSummaryAttribute(
        f.record,
        f.attribute.attributeId,
        "value",
        null,
        "",
        f.reviewer,
        f.deps,
      ),
    ).rejects.toThrow(/rationale/u);
    await expect(
      approvePlanSummaryAttribute(
        { ...f.record, overallStatus: "final" },
        f.attribute.attributeId,
        "value",
        null,
        "reason",
        f.reviewer,
        f.deps,
      ),
    ).rejects.toThrow(/integrity/u);
    const noCitations = await addPlanSummaryAttribute(
      f.empty,
      "A",
      "other",
      "value",
      "manual",
      [],
      null,
      null,
      null,
      f.reviewer,
      f.deps,
    );
    const attr = noCitations.sections[0]?.attributes[0];
    if (!attr) throw new Error("Missing attribute");
    await expect(
      approvePlanSummaryAttribute(
        noCitations,
        attr.attributeId,
        "value",
        null,
        "reason",
        f.reviewer,
        f.deps,
      ),
    ).rejects.toThrow(/citation/u);
  });
});

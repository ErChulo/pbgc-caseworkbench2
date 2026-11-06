import { describe, expect, it } from "vitest";

import {
  authorRule,
  validateRuleRecord,
} from "../../../../src/domain/plan-rules/rule-authoring";
import {
  createUnresolvedItem,
  resolveItem,
} from "../../../../src/domain/plan-rules/unresolved-items";
import {
  applicability,
  candidate,
  citation,
  evidenceCatalog,
  human,
  rule,
} from "./governed-fixtures";

const dependencies = {
  uuid: () => "00000000-0000-4000-8000-000000000210",
  now: () => "2026-07-28T12:00:00.000Z",
};

async function input() {
  return {
    proposedCandidates: [await candidate()],
    primaryCitation: citation,
    catalog: await evidenceCatalog(),
    unresolvedRecords: [],
    authorityOverrides: [],
    governingRestatement: "The monthly benefit equals accrued benefit.",
    effectiveDate: "2020-01-01",
    endDate: null,
    applicabilityConditions: applicability,
    requiredApplicabilityDimensions: ["participant-group" as const],
    affectedScope: "benefit/monthly",
    reviewer: human,
    approvalRationale: "Synthetic human approval.",
    confidence: 0.9,
    ruleSetVersion: "feature-001-plan-rule-v1",
  };
}

describe("governed rule authoring", () => {
  it("authors a deeply immutable, deterministic, released-primary rule", async () => {
    const first = await authorRule(await input(), dependencies);
    const second = await authorRule(await input(), dependencies);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.ruleContentSha256).toBe(second.value.ruleContentSha256);
    expect(first.value.reviewStatus).toBe("human-approved");
    expect(Object.isFrozen(first.value.applicabilityConditions[0])).toBe(true);
    expect((await validateRuleRecord(first.value)).ok).toBe(true);
    expect(
      (
        await validateRuleRecord({
          ...first.value,
          authorHuman: { ...first.value.authorHuman, displayName: "Tampered" },
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await validateRuleRecord({
          ...first.value,
          approvalRationale: "Tampered rationale.",
        })
      ).ok,
    ).toBe(false);
  });

  it("enforces date ranges, released evidence, and affected applicability dimensions", async () => {
    expect(
      await authorRule(
        { ...(await input()), endDate: "2019-12-31" },
        dependencies,
      ),
    ).toMatchObject({ ok: false, error: { code: "EFFECTIVE_DATE_VIOLATION" } });
    expect(
      await authorRule(
        {
          ...(await input()),
          catalog: await evidenceCatalog(citation.sourceRole, "case", "stale"),
        },
        dependencies,
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_PRIMARY_CITATION" } });
    expect(
      await authorRule(
        {
          ...(await input()),
          requiredApplicabilityDimensions: [
            "participant-group",
            "amendment-period",
          ],
        },
        dependencies,
      ),
    ).toMatchObject({ ok: false, error: { code: "APPLICABILITY_INVALID" } });
    expect(
      await authorRule(
        {
          ...(await input()),
          primaryCitation: { ...citation, sourceRole: "regulation" },
          catalog: await evidenceCatalog("regulation", "reference"),
        },
        dependencies,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "AUTHORITY_OVERRIDE_REQUIRED" },
    });
    expect(
      await authorRule(
        {
          ...(await input()),
          primaryCitation: {
            ...citation,
            sourceRole: "approved-plan-summary",
          },
          catalog: await evidenceCatalog("approved-plan-summary", "reference"),
        },
        dependencies,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "AUTHORITY_OVERRIDE_REQUIRED" },
    });
  });

  it("blocks intersecting open unresolved items", async () => {
    const unresolved = await createUnresolvedItem(
      {
        kind: "ambiguous-text",
        affectedScope: "benefit",
        competingInterpretations: [
          {
            interpretationId: "00000000-0000-4000-8000-000000000211" as never,
            statement: "A",
            evidence: [citation],
            sourceCandidateId: null,
          },
          {
            interpretationId: "00000000-0000-4000-8000-000000000212" as never,
            statement: "B",
            evidence: [citation],
            sourceCandidateId: null,
          },
        ],
        consequence: "Benefit amount differs.",
        reviewer: human,
      },
      dependencies,
    );
    if (!unresolved.ok) throw new Error(unresolved.error);
    expect(
      await authorRule(
        { ...(await input()), unresolvedRecords: [unresolved.value] },
        dependencies,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "BLOCKED_BY_UNRESOLVED_ITEM" },
    });
    const resolved = await resolveItem(
      unresolved.value,
      "accept",
      unresolved.value.competingInterpretations[0]?.interpretationId ?? null,
      "Synthetic resolution.",
      human,
      {
        uuid: () => "00000000-0000-4000-8000-000000000213",
        now: () => "2026-07-28T13:00:00.000Z",
      },
    );
    if (!resolved.ok) throw new Error(resolved.error);
    expect(
      (
        await authorRule(
          {
            ...(await input()),
            unresolvedRecords: [unresolved.value, resolved.value.item],
          },
          dependencies,
        )
      ).ok,
    ).toBe(true);
  });

  it("rejects catalog tampering instead of trusting caller citation metadata", async () => {
    const governed = await input();
    const artifact = governed.catalog.caseEvidence[0];
    if (artifact === undefined) throw new Error("Missing synthetic artifact.");
    const result = await authorRule(
      {
        ...governed,
        catalog: {
          ...governed.catalog,
          caseEvidence: [{ ...artifact, reviewStatus: "stale" }],
        },
      },
      dependencies,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_PRIMARY_CITATION" },
    });
  });

  it("rejects changed candidate content, identity, and non-finite confidence", async () => {
    const base = await input();
    const original = await candidate();
    for (const modified of [
      { ...original, verbatimText: "Changed evidence." },
      {
        ...original,
        candidateId:
          "00000000-0000-4000-8000-000000000299" as typeof original.candidateId,
      },
      { ...original, confidence: Number.NaN },
    ]) {
      expect(
        await authorRule(
          { ...base, proposedCandidates: [modified] },
          dependencies,
        ),
      ).toMatchObject({
        ok: false,
        error: { code: "INVALID_PRIMARY_CITATION" },
      });
    }
    expect(
      await authorRule({ ...base, confidence: Number.NaN }, dependencies),
    ).toMatchObject({ ok: false, error: { code: "INVALID_PRIMARY_CITATION" } });
    expect(
      await authorRule(
        {
          ...base,
          primaryCitation: { ...citation, provisionIdentifier: "other" },
        },
        dependencies,
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_PRIMARY_CITATION" } });
  });

  it("accepts an unchanged segment locator paired to the catalog artifact", async () => {
    const base = await input();
    const { extractProvisionCandidate } =
      await import("../../../../src/domain/plan-rules/candidate-extraction");
    const data = await candidate();
    const segment = await extractProvisionCandidate({
      ...data,
      artifactLocator: "text:line=1:offset=0",
    });
    if (!segment.ok) throw new Error(segment.error);
    const result = await authorRule(
      {
        ...base,
        proposedCandidates: [segment.value],
        primaryCitation: {
          ...citation,
          citationLocator: segment.value.artifactLocator,
        },
      },
      dependencies,
    );
    expect(result.ok).toBe(true);
    expect(segment.value.artifactLocator).toBe("text:line=1:offset=0");
  });

  it("rejects tampered, same-id, and different-scope predecessors", async () => {
    const predecessor = await rule();
    const base = { ...(await input()), effectiveDate: "2022-01-01" };
    for (const previous of [
      { ...predecessor, governingRestatement: "Tampered" },
      await rule(dependencies.uuid()),
      await rule("00000000-0000-4000-8000-000000000202"),
    ]) {
      const draft =
        previous.ruleId === "00000000-0000-4000-8000-000000000202"
          ? { ...base, affectedScope: "other" }
          : base;
      expect(
        await authorRule({ ...draft, predecessor: previous }, dependencies),
      ).toMatchObject({
        ok: false,
        error: { code: "SUPERSESSION_CHAIN_INVALID" },
      });
    }
  });

  it("snapshots authoring input before asynchronous checks", async () => {
    const base = await input();
    const pending = authorRule(base, dependencies);
    base.governingRestatement = "Changed after authoring started.";
    const result = await pending;
    expect(result.ok && result.value.governingRestatement).toBe(
      "The monthly benefit equals accrued benefit.",
    );
  });

  it("binds a successor to an unchanged predecessor hash with a gapless link", async () => {
    const predecessor = await rule();
    const successor = await rule(
      "00000000-0000-4000-8000-000000000202",
      "2026-07-28T13:00:00.000Z",
      predecessor,
    );
    expect(successor.ruleId).not.toBe(predecessor.ruleId);
    expect(successor.supersessionChain.at(-1)).toMatchObject({
      ordinal: 1,
      predecessorRuleId: predecessor.ruleId,
      predecessorRuleContentSha256: predecessor.ruleContentSha256,
    });
    expect(predecessor.supersessionChain).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import {
  checkAuthorityOrder,
  enforceAuthorityOrder,
  getSupersessionChain,
  queryAuthority,
  queryEffectiveRule,
} from "../../../../src/domain/plan-rules/authority-service";
import {
  createAuthorityOverride,
  effectiveAuthorityOverrides,
  issueOverride,
} from "../../../../src/domain/plan-rules/authority-override";
import type { PlanRuleRecord } from "../../../../src/domain/plan-rules/models";
import { citation, evidenceCatalog, human, rule } from "./governed-fixtures";

describe("authority and supersession governance", () => {
  it("proposes immutable re-authoring when higher authority appears", async () => {
    const current = await rule();
    const lowerRule = {
      ...current,
      primaryCitation: {
        ...citation,
        sourceRole: "certified-case-report" as const,
      },
    };
    expect(checkAuthorityOrder(lowerRule, citation).action).toBe(
      "propose-re-authoring",
    );
    expect(checkAuthorityOrder(current, lowerRule.primaryCitation).action).toBe(
      "retain",
    );
  });

  it("issues and enforces one-scope, one-artifact overrides", async () => {
    const catalog = await evidenceCatalog("regulation", "reference");
    const override = await issueOverride(
      catalog.caseId,
      "benefit/monthly",
      "regulation",
      citation.artifactSha256,
      "Synthetic case-specific determination.",
      human,
      {
        uuid: () => "00000000-0000-4000-8000-000000000321",
        now: () => "2026-07-28T12:00:00.000Z",
      },
    );
    if (!override.ok) throw new Error(override.error);
    const current = await rule();
    const governed = {
      ...current,
      primaryCitation: {
        ...citation,
        sourceRole: "regulation" as const,
      },
      authorityOverrideId: override.value.overrideId,
    };
    expect(
      (await enforceAuthorityOrder(governed, [override.value], catalog)).ok,
    ).toBe(true);
    expect((await enforceAuthorityOrder(governed, [], catalog)).ok).toBe(false);
    expect(
      (
        await effectiveAuthorityOverrides(
          [{ ...override.value, scopeRationale: "Tampered" }],
          catalog,
        )
      ).ok,
    ).toBe(false);

    const successor = await createAuthorityOverride({
      overrideId: "00000000-0000-4000-8000-000000000322",
      caseId: catalog.caseId,
      affectedRuleScope: "benefit/monthly",
      authorizedSourceRole: "regulation",
      authorizedArtifactSha256: citation.artifactSha256,
      scopeRationale: "Superseding synthetic determination.",
      issuer: human,
      issuedAt: "2026-07-29T12:00:00.000Z",
      supersessionChain: [
        {
          ordinal: 1,
          priorOverrideId: override.value.overrideId,
          priorOverrideContentSha256: override.value.overrideContentSha256,
          linkType: "supersession",
        },
      ],
    });
    if (!successor.ok) throw new Error(successor.error);
    const projection = await effectiveAuthorityOverrides(
      [override.value, successor.value],
      catalog,
    );
    if (!projection.ok) throw new Error(projection.error);
    expect(projection.value.map((value) => value.overrideId)).toEqual([
      successor.value.overrideId,
    ]);
    expect(
      (
        await enforceAuthorityOrder(
          governed,
          [override.value, successor.value],
          catalog,
        )
      ).ok,
    ).toBe(false);
  });

  it("emits unresolved review work for stale and superseded authority", async () => {
    const current = await rule();
    const result = await queryAuthority(
      current.ruleId,
      [current],
      [
        {
          artifact: {
            artifactId: "00000000-0000-4000-8000-000000000330" as never,
            sha256: citation.artifactSha256,
            sizeBytes: 1,
            locator: citation.artifactLocator,
            mediaType: "text/plain",
            receiptId: "00000000-0000-4000-8000-000000000331" as never,
            receiptIds: ["00000000-0000-4000-8000-000000000331" as never],
            exactDuplicateOfSha256: null,
            containedBySha256: null,
            sourceRole: citation.sourceRole,
            reviewStatus: "stale",
            importedAt: "2026-07-28T10:00:00.000Z" as never,
          },
          supersededOn: "2026-01-01",
        },
      ],
      human,
      {
        uuid: () => "00000000-0000-4000-8000-000000000332",
        now: () => "2026-07-28T12:00:00.000Z",
      },
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.value.unresolvedItems[0]?.kind).toBe("superseded-source");
  });

  it("detects real graph cycles and queries effective-dated chains", async () => {
    const first = await rule();
    const second = await rule(
      "00000000-0000-4000-8000-000000000202",
      "2026-07-28T13:00:00.000Z",
      first,
    );
    const chain = getSupersessionChain([first, second], first.ruleId);
    if (!chain.ok) throw new Error(chain.error);
    expect(chain.value.map((value) => value.ruleId)).toEqual([
      first.ruleId,
      second.ruleId,
    ]);
    expect(queryEffectiveRule(chain.value, "2021-01-01")).toMatchObject({
      ok: true,
      value: { ruleId: first.ruleId },
    });
    expect(queryEffectiveRule(chain.value, "2023-01-01")).toMatchObject({
      ok: true,
      value: { ruleId: second.ruleId },
    });

    const branch = await rule(
      "00000000-0000-4000-8000-000000000207",
      "2026-07-28T14:00:00.000Z",
      first,
    );
    expect(
      getSupersessionChain([first, second, branch], first.ruleId),
    ).toMatchObject({
      ok: false,
      error: "Supersession history branches from one predecessor.",
    });
    expect(
      queryEffectiveRule(
        [first, { ...second, effectiveDate: first.effectiveDate }],
        "2021-01-01",
      ).ok,
    ).toBe(false);
    const overlappingFirst = { ...first, endDate: "2025-01-01" };
    expect(
      getSupersessionChain([overlappingFirst, second], first.ruleId).ok,
    ).toBe(false);

    const cyclicFirst = withPredecessor(first, second);
    const cyclicSecond = withPredecessor(second, cyclicFirst);
    const reboundFirst = withPredecessor(cyclicFirst, cyclicSecond);
    expect(
      getSupersessionChain([reboundFirst, cyclicSecond], reboundFirst.ruleId),
    ).toMatchObject({
      ok: false,
      error: "The supersession graph contains a cycle.",
    });
  });
});

function withPredecessor(
  ruleValue: PlanRuleRecord,
  predecessor: PlanRuleRecord,
): PlanRuleRecord {
  return {
    ...ruleValue,
    supersessionChain: [
      {
        ordinal: 1,
        predecessorRuleId: predecessor.ruleId,
        predecessorRuleContentSha256: predecessor.ruleContentSha256,
        effectiveDate: ruleValue.effectiveDate,
        linkType: "supersession",
      },
    ],
  };
}

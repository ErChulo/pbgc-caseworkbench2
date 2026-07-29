import { describe, expect, it } from "vitest";

import {
  createUnresolvedItem,
  hiddenContentUnresolvedInput,
  projectLatestUnresolvedItems,
  replayResolutionHistory,
  resolveItem,
  staleSourceUnresolvedInput,
  surfaceHiddenContentFlag,
  unresolvedItemEmitters,
} from "../../../../src/domain/plan-rules/unresolved-items";
import { parseUuid } from "../../../../src/domain/shared/types";
import { citation, human } from "./governed-fixtures";

function uuid(value: string) {
  const parsed = parseUuid(value);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function input() {
  return {
    kind: "ambiguous-text" as const,
    affectedScope: "benefit/monthly",
    competingInterpretations: [
      {
        interpretationId: uuid("00000000-0000-4000-8000-000000000302"),
        statement: "Use formula A.",
        evidence: [citation],
        sourceCandidateId: null,
      },
      {
        interpretationId: uuid("00000000-0000-4000-8000-000000000303"),
        statement: "Use formula B.",
        evidence: [citation],
        sourceCandidateId: null,
      },
    ],
    consequence: "Monthly benefit differs.",
    reviewer: human,
  };
}

describe("governed unresolved items", () => {
  it("creates canonical immutable open items and replays a hash-bound resolution", async () => {
    const sequence = [
      "00000000-0000-4000-8000-000000000301",
      "00000000-0000-4000-8000-000000000304",
    ];
    const dependencies = {
      uuid: () => sequence.shift() ?? "00000000-0000-4000-8000-000000000399",
      now: () => "2026-07-28T12:00:00.000Z",
    };
    const created = await createUnresolvedItem(input(), dependencies);
    if (!created.ok) throw new Error(created.error);
    const resolved = await resolveItem(
      created.value,
      "accept",
      created.value.competingInterpretations[0]?.interpretationId ?? null,
      "Selected after synthetic human review.",
      human,
      dependencies,
    );
    if (!resolved.ok) throw new Error(resolved.error);
    expect(resolved.value.item.resolutionHistory[0]).toMatchObject({
      appendOrdinal: 1,
      priorEventId: null,
      resultingStatus: "resolved",
    });
    expect((await replayResolutionHistory(resolved.value.item)).ok).toBe(true);
    expect(
      (await projectLatestUnresolvedItems([created.value, resolved.value.item]))
        .ok,
    ).toBe(true);
    expect((await projectLatestUnresolvedItems([resolved.value.item])).ok).toBe(
      false,
    );
    expect(
      (
        await projectLatestUnresolvedItems([
          created.value,
          {
            ...resolved.value.item,
            priorRevisionContentSha256: created.value.itemContentSha256,
          },
        ])
      ).ok,
    ).toBe(false);
    expect(Object.isFrozen(resolved.value.item.resolutionHistory)).toBe(true);
  });

  it("branches without discarding either competing interpretation", async () => {
    const sequence = [
      "00000000-0000-4000-8000-000000000310",
      "00000000-0000-4000-8000-000000000311",
      "00000000-0000-4000-8000-000000000312",
    ];
    const dependencies = {
      uuid: () => sequence.shift() ?? "00000000-0000-4000-8000-000000000319",
      now: () => "2026-07-28T12:00:00.000Z",
    };
    const created = await createUnresolvedItem(input(), dependencies);
    if (!created.ok) throw new Error(created.error);
    const branched = await resolveItem(
      created.value,
      "branch",
      created.value.competingInterpretations[0]?.interpretationId ?? null,
      "Both paths require separate review.",
      human,
      dependencies,
    );
    if (!branched.ok) throw new Error(branched.error);
    expect(branched.value.item.status).toBe("superseded");
    expect(branched.value.branchedItem?.competingInterpretations).toHaveLength(
      2,
    );
    expect(branched.value.branchedItem?.linkedUnresolvedItemIds).toContain(
      created.value.itemId,
    );
  });

  it("provides typed hidden, stale, and superseded source emitters", async () => {
    expect(hiddenContentUnresolvedInput("rule/a", citation, null).kind).toBe(
      "hidden-content-flag",
    );
    expect(staleSourceUnresolvedInput("rule/a", citation, null).kind).toBe(
      "stale-source",
    );
    expect(
      staleSourceUnresolvedInput("rule/a", citation, null, true).kind,
    ).toBe("superseded-source");
    expect(Object.keys(unresolvedItemEmitters)).toHaveLength(10);
    expect(unresolvedItemEmitters["missing-required-value"](input()).kind).toBe(
      "missing-required-value",
    );
    const surfaced = await surfaceHiddenContentFlag(
      true,
      "candidate/a",
      citation,
      human,
      {
        uuid: () => "00000000-0000-4000-8000-000000000350",
        now: () => "2026-07-28T12:00:00.000Z",
      },
    );
    expect(surfaced).toMatchObject({
      ok: true,
      value: { kind: "hidden-content-flag" },
    });
  });
});

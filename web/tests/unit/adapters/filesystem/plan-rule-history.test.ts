import { describe, expect, it } from "vitest";
import { readPlanRuleHistory } from "../../../../src/adapters/filesystem/plan-rule-history";
import { bytesReader } from "../../../../src/app/utilities/file-readers";
import { rule } from "../../domain/plan-rules/governed-fixtures";
import { parseUuid } from "../../../../src/domain/shared/types";
import type { PlanRuleRecord } from "../../../../src/domain/plan-rules/models";

const parsedId = parseUuid("00000000-0000-4000-8000-000000000001");
if (!parsedId.ok) throw new Error("Invalid fixture");
const caseId = parsedId.value;
const rulesPath = `cases/${caseId}/evidence/rule-records.jsonl`;
const eventsPath = `cases/${caseId}/reviews/events.jsonl`;
function event(record: PlanRuleRecord) {
  return {
    eventType: "plan-rule-recorded",
    ruleId: record.ruleId,
    ruleContentSha256: record.ruleContentSha256,
    effectiveDate: record.effectiveDate,
    recordedAt: "2026-07-28T14:00:00Z",
    schemaVersion: "1.0.0",
  };
}
function fixture(records: readonly unknown[], events: readonly unknown[]) {
  const encode = (values: readonly unknown[]) =>
    new TextEncoder().encode(
      values.map((value) => `${JSON.stringify(value)}\n`).join(""),
    );
  const files = new Map([
    [rulesPath, encode(records)],
    [eventsPath, encode(events)],
  ]);
  const workspace = {
    openChunkReader: (path: string) => {
      const bytes = files.get(path);
      return Promise.resolve(
        bytes === undefined
          ? { ok: false as const, error: { code: "NOT_FOUND" } }
          : { ok: true as const, value: bytesReader(bytes) },
      );
    },
  };
  return { files, workspace };
}

describe("plan-rule local history", () => {
  it("replays complete hash-checked records and matching events in order", async () => {
    const first = await rule();
    const next = await rule(
      "00000000-0000-4000-8000-000000000202",
      "2026-07-28T13:00:00Z",
      first,
    );
    const { workspace } = fixture(
      [first, next],
      [{ eventType: "date-selection" }, event(first), event(next)],
    );
    expect(await readPlanRuleHistory(workspace, caseId)).toEqual({
      ok: true,
      rules: [first, next],
    });
  });
  it("rejects altered, duplicate, truncated and unpaired records or events", async () => {
    const first = await rule();
    for (const { records, events } of [
      {
        records: [{ ...first, governingRestatement: "changed" }],
        events: [event(first)],
      },
      { records: [first, first], events: [event(first)] },
      { records: [first], events: [] },
      { records: [first], events: [event(first), event(first)] },
      { records: [], events: [event(first)] },
      {
        records: [first],
        events: [{ ...event(first), ruleContentSha256: "0".repeat(64) }],
      },
    ]) {
      expect(
        (await readPlanRuleHistory(fixture(records, events).workspace, caseId))
          .ok,
      ).toBe(false);
    }
    const truncated = fixture([first], [event(first)]);
    truncated.files.set(
      rulesPath,
      new TextEncoder().encode(JSON.stringify(first)),
    );
    expect((await readPlanRuleHistory(truncated.workspace, caseId)).ok).toBe(
      false,
    );
  });
  it("rejects a successor when its predecessor is missing or out of order", async () => {
    const first = await rule();
    const next = await rule(
      "00000000-0000-4000-8000-000000000202",
      "2026-07-28T13:00:00Z",
      first,
    );
    expect(
      (
        await readPlanRuleHistory(
          fixture([next], [event(next)]).workspace,
          caseId,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await readPlanRuleHistory(
          fixture([next, first], [event(first), event(next)]).workspace,
          caseId,
        )
      ).ok,
    ).toBe(false);
  });
});

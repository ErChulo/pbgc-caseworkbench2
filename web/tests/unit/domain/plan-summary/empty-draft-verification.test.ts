import { expect, it } from "vitest";
import { createEmptyPlanSummaryRecord } from "../../../../src/domain/plan-summary/plan-summary-governance";
import { verifyEmptyPlanSummaryDraft } from "../../../../src/domain/plan-summary/empty-draft-verification";
import {
  parseUuid,
  parseUtcTimestamp,
} from "../../../../src/domain/shared/types";

const a = parseUuid("00000000-0000-4000-8000-000000000001");
const b = parseUuid("00000000-0000-4000-8000-000000000002");
const time = parseUtcTimestamp("2026-11-08T12:00:00.000Z");
if (!a.ok || !b.ok || !time.ok) throw new Error("Invalid synthetic fixture");
it("restores only an exact, case-bound, consistent empty draft", async () => {
  const draft = await createEmptyPlanSummaryRecord(a.value, {
    uuid: { generate: () => a.value },
    clock: { now: () => time.value },
  });
  expect(await verifyEmptyPlanSummaryDraft(draft, a.value)).toEqual(draft);
  expect(await verifyEmptyPlanSummaryDraft(draft, b.value)).toBeNull();
  expect(
    await verifyEmptyPlanSummaryDraft(
      { ...draft, overallStatus: "final" },
      a.value,
    ),
  ).toBeNull();
  expect(
    await verifyEmptyPlanSummaryDraft({ ...draft, extra: true }, a.value),
  ).toBeNull();
  const altered = structuredClone(draft);
  (altered.sections[0] as { sectionTitle: string }).sectionTitle = "Changed";
  expect(await verifyEmptyPlanSummaryDraft(altered, a.value)).toBeNull();
  const withAttribute = structuredClone(draft);
  (withAttribute.sections[0]?.attributes as unknown[]).push({
    fieldPath: "fake",
  });
  expect(await verifyEmptyPlanSummaryDraft(withAttribute, a.value)).toBeNull();
});

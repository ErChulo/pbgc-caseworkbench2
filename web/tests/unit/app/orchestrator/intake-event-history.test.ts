import { describe, expect, it } from "vitest";
import { hasConsistentIntakeEventHistory } from "../../../../src/app/orchestrator/intake-event-history";

const caseId = "01234567-89ab-4cde-8fab-0123456789ab";
const snapshot = "a".repeat(64);
const event = {
  schemaVersion: "1.0.0",
  eventId: "11234567-89ab-4cde-8fab-0123456789ab",
  caseId,
  recordedAt: "2026-11-05T00:00:00.000Z",
  resultingSnapshotId: snapshot,
  items: [],
  receivedEntries: [],
};
const encode = (text: string) => new TextEncoder().encode(text);
const line = (value: unknown) => `${JSON.stringify(value)}\n`;
const check = (text: string) =>
  hasConsistentIntakeEventHistory(encode(text), caseId, snapshot);

describe("intake event envelope and terminal checkpoint", () => {
  it("accepts valid complete lines including multiple snapshots", () => {
    expect(check(line(event))).toBe(true);
    expect(
      check(
        line({ ...event, resultingSnapshotId: "b".repeat(64) }) +
          line({ ...event, eventId: "21234567-89ab-4cde-8fab-0123456789ab" }),
      ),
    ).toBe(true);
  });
  it("rejects missing, partial, malformed, foreign, duplicate and mismatched records", () => {
    for (const text of [
      "",
      JSON.stringify(event),
      `${line(event)}garbage\n`,
      line(event) + line(event),
      line({ ...event, caseId: "foreign" }),
      line({ ...event, eventId: "invalid" }),
      line({ ...event, recordedAt: "invalid" }),
      line({ ...event, resultingSnapshotId: "b".repeat(64) }),
      line({ ...event, items: null }),
      line({ ...event, receivedEntries: null }),
      line({ ...event, schemaVersion: "2.0.0" }),
      "[]\n",
    ])
      expect(check(text)).toBe(false);
    expect(
      hasConsistentIntakeEventHistory(new Uint8Array([0xff]), caseId, snapshot),
    ).toBe(false);
  });
});

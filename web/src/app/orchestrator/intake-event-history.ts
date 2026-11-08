import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
} from "../../domain/shared/types";

/**
 * Checks the persisted envelope and terminal checkpoint, not event contents,
 * complete history, authorship, or a replay of the intake operation.
 * Callers must enforce the local byte limit before invoking this function.
 */
export function hasConsistentIntakeEventHistory(
  bytes: Uint8Array,
  caseId: string,
  expectedSnapshotId: string,
): boolean {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.endsWith("\n")) return false;
    const lines = text.slice(0, -1).split("\n");
    const ids = new Set<string>();
    let lastSnapshotId = "";
    for (const line of lines) {
      const value: unknown = JSON.parse(line);
      if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
      const event = value as Record<string, unknown>;
      if (
        event.schemaVersion !== "1.0.0" ||
        event.caseId !== caseId ||
        typeof event.eventId !== "string" ||
        !parseUuid(event.eventId).ok ||
        ids.has(event.eventId) ||
        typeof event.recordedAt !== "string" ||
        !parseUtcTimestamp(event.recordedAt).ok ||
        typeof event.resultingSnapshotId !== "string" ||
        !parseSha256(event.resultingSnapshotId).ok ||
        !Array.isArray(event.items) ||
        !Array.isArray(event.receivedEntries)
      )
        return false;
      ids.add(event.eventId);
      lastSnapshotId = event.resultingSnapshotId;
    }
    return lastSnapshotId === expectedSnapshotId;
  } catch {
    return false;
  }
}

import { hashTyped } from "../manifests/canonical-json";
import { deterministicUuid } from "../build-spec/identity";
import { parseUuid } from "../shared/types";
import type { Uuid, UtcTimestamp } from "../shared/types";
import type { AuditEvent } from "./models";

export interface AuditLog {
  readonly events: readonly AuditEvent[];
}

export async function createAuditEvent(input: {
  readonly ruleId: Uuid;
  readonly action: "created" | "approved" | "rejected" | "superseded" | "effective-dated";
  readonly actor: string;
  readonly timestamp: UtcTimestamp;
  readonly rationale: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): Promise<AuditEvent> {
  const deterministicPayload = {
    ruleId: input.ruleId,
    action: input.action,
    actor: input.actor,
    timestamp: input.timestamp,
    rationale: input.rationale,
    metadata: input.metadata ?? {},
  } as const;

  const eventContentSha256 = (await hashTyped(deterministicPayload, {
    typeName: "AuditEventContent",
  })) as import("../shared/types").Sha256;

  const eventIdString = await deterministicUuid("AuditEvent", {
    ruleId: input.ruleId,
    action: input.action,
    timestamp: input.timestamp,
    actor: input.actor,
  });
  const eventIdResult = parseUuid(eventIdString);
  if (!eventIdResult.ok) throw new Error("Failed to parse UUID: " + eventIdResult.error.message);
  const eventId = eventIdResult.value;

  return {
    eventId,
    ruleId: input.ruleId,
    action: input.action,
    actor: input.actor,
    timestamp: input.timestamp,
    rationale: input.rationale,
    metadata: input.metadata ?? {},
    eventContentSha256: eventContentSha256,
  };
}

export function appendAuditEvent(
  log: AuditLog,
  event: AuditEvent,
): AuditLog {
  return {
    events: [...log.events, event],
  };
}

export function createAuditLog(
  events: readonly AuditEvent[] = [],
): AuditLog {
  return { events: [...events] };
}

export function getAuditEventsForRule(
  log: AuditLog,
  ruleId: Uuid,
): AuditEvent[] {
  return log.events
    .filter((e) => e.ruleId === ruleId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getAuditEventsByActor(
  log: AuditLog,
  actor: string,
): AuditEvent[] {
  return log.events
    .filter((e) => e.actor === actor)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getAuditEventsByAction(
  log: AuditLog,
  action: AuditEvent["action"],
): AuditEvent[] {
  return log.events
    .filter((e) => e.action === action)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getAuditEventsInRange(
  log: AuditLog,
  startDate: UtcTimestamp,
  endDate: UtcTimestamp,
): AuditEvent[] {
  return log.events
    .filter((e) => e.timestamp >= startDate && e.timestamp <= endDate)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function getAuditEventById(
  log: AuditLog,
  eventId: string,
): AuditEvent | null {
  return log.events.find((e) => e.eventId === eventId) ?? null;
}

export function verifyAuditLogIntegrity(
  log: AuditLog,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [index, event] of log.events.entries()) {
    // Note: Actual hash verification would require re-computing the hash
    // This is a structural integrity check
    if (event.eventId.length !== 64) {
      errors.push("Event at index " + String(index) + " has invalid eventId");
    }
    if (!event.ruleId) {
      errors.push("Event at index " + String(index) + " has missing ruleId");
    }
    if (!event.actor || event.actor.trim() === "") {
      errors.push("Event at index " + String(index) + " has missing actor");
    }
    if (!event.timestamp) {
      errors.push("Event at index " + String(index) + " has missing timestamp");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getAuditSummary(
  log: AuditLog,
): {
  readonly totalEvents: number;
  readonly byAction: Readonly<Record<string, number>>;
  readonly byActor: Readonly<Record<string, number>>;
  readonly dateRange: { readonly earliest: UtcTimestamp | null; readonly latest: UtcTimestamp | null };
} {
  const byAction: Record<string, number> = {};
  const byActor: Record<string, number> = {};
  let earliest: UtcTimestamp | null = null;
  let latest: UtcTimestamp | null = null;

  for (const event of log.events) {
    byAction[event.action] = (byAction[event.action] ?? 0) + 1;
    byActor[event.actor] = (byActor[event.actor] ?? 0) + 1;

    if (earliest === null || event.timestamp < earliest) {
      earliest = event.timestamp;
    }
    if (latest === null || event.timestamp > latest) {
      latest = event.timestamp;
    }
  }

  return {
    totalEvents: log.events.length,
    byAction,
    byActor,
    dateRange: { earliest, latest },
  };
}
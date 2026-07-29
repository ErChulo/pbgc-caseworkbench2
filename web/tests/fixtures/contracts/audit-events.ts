import {
  SHA_A,
  SHA_B,
  systemActor,
  TIMESTAMP,
  UUID_A,
  UUID_B,
} from "./schema-cases";

export const receivedEvent = {
  eventId: UUID_A,
  eventType: "artifact-received",
  appendOrdinal: 1,
  priorEventContentSha256: null,
  subjectKey: `artifact:${SHA_A}`,
  deterministicPayload: {
    artifactSha256: SHA_A,
    action: "received",
    result: "provisional",
  },
  eventContentSha256: SHA_A,
  actor: systemActor,
  occurredAt: TIMESTAMP,
  ruleSetVersion: "1.0.0",
};

export const preservedEvent = {
  eventId: UUID_B,
  eventType: "artifact-preserved",
  appendOrdinal: 2,
  priorEventContentSha256: SHA_A,
  subjectKey: `artifact:${SHA_A}`,
  deterministicPayload: {
    artifactSha256: SHA_A,
    action: "preserved",
    result: "provisional",
  },
  eventContentSha256: SHA_B,
  actor: systemActor,
  occurredAt: "2026-07-25T12:01:00.000Z",
  ruleSetVersion: "1.0.0",
};

export const validAuditHistory = [receivedEvent, preservedEvent] as const;

export const invalidAuditHistories = [
  {
    name: "ordinal gap",
    events: [receivedEvent, { ...preservedEvent, appendOrdinal: 3 }],
    expectedCode: "AUDIT_ORDINAL_GAP",
  },
  {
    name: "stale predecessor hash",
    events: [
      receivedEvent,
      { ...preservedEvent, priorEventContentSha256: "c".repeat(64) },
    ],
    expectedCode: "AUDIT_PREDECESSOR_HASH_MISMATCH",
  },
  {
    name: "subject change",
    events: [
      receivedEvent,
      { ...preservedEvent, subjectKey: `artifact:${SHA_B}` },
    ],
    expectedCode: "AUDIT_SUBJECT_MISMATCH",
  },
  {
    name: "invalid event transition",
    events: [
      receivedEvent,
      {
        ...preservedEvent,
        eventType: "artifact-received",
        deterministicPayload: {
          ...preservedEvent.deterministicPayload,
          action: "received",
        },
      },
    ],
    expectedCode: "AUDIT_TRANSITION_INVALID",
  },
] as const;

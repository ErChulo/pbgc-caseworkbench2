import { canonicalize } from "../manifests/canonical-json";

const sha256Pattern = /^[0-9a-f]{64}$/u;

type JsonObject = Readonly<Record<string, unknown>>;

export interface AuditIssue {
  readonly code:
    | "AUDIT_EVENT_INVALID"
    | "AUDIT_EVENT_HASH_INVALID"
    | "AUDIT_ORDINAL_GAP"
    | "AUDIT_PREDECESSOR_HASH_MISMATCH"
    | "AUDIT_SUBJECT_MISMATCH"
    | "AUDIT_TRANSITION_INVALID";
  readonly eventIndex: number;
  readonly message: string;
}

export interface AuditHistoryValidation {
  readonly valid: boolean;
  readonly issues: readonly AuditIssue[];
}

export interface DecodedAuditJsonl {
  readonly events: readonly unknown[];
  readonly truncatedFinalLine: boolean;
}

export class AuditLogError extends Error {
  readonly code:
    | "AUDIT_JSONL_EMPTY_LINE"
    | "AUDIT_JSONL_INVALID_RECORD"
    | "AUDIT_JSONL_NON_OBJECT_RECORD";
  readonly lineNumber: number;

  constructor(
    code: AuditLogError["code"],
    lineNumber: number,
    message: string,
  ) {
    super(`${code} at JSONL line ${String(lineNumber)}: ${message}`);
    this.name = "AuditLogError";
    this.code = code;
    this.lineNumber = lineNumber;
  }
}

export function encodeAuditJsonl(events: readonly unknown[]): string {
  return events.length === 0
    ? ""
    : `${events.map((event) => canonicalize(event)).join("\n")}\n`;
}

export function decodeAuditJsonl(input: string): DecodedAuditJsonl {
  if (input.length === 0) {
    return Object.freeze({
      events: Object.freeze([]),
      truncatedFinalLine: false,
    });
  }

  const terminated = input.endsWith("\n");
  const lines = input.split("\n");
  if (terminated) lines.pop();

  const events: unknown[] = [];
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const isFinalUnterminatedLine = !terminated && index === lines.length - 1;
    if (line.length === 0) {
      if (isFinalUnterminatedLine) {
        return decoded(events, true);
      }
      throw new AuditLogError(
        "AUDIT_JSONL_EMPTY_LINE",
        lineNumber,
        "Blank records are not valid append-only audit events.",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      if (isFinalUnterminatedLine) {
        return decoded(events, true);
      }
      throw new AuditLogError(
        "AUDIT_JSONL_INVALID_RECORD",
        lineNumber,
        "The record is not valid JSON.",
      );
    }

    if (!isJsonObject(parsed)) {
      if (isFinalUnterminatedLine) {
        return decoded(events, true);
      }
      throw new AuditLogError(
        "AUDIT_JSONL_NON_OBJECT_RECORD",
        lineNumber,
        "Audit records must be JSON objects.",
      );
    }
    events.push(deepFreeze(parsed));
  }

  return decoded(events, false);
}

export function validateAuditHistory(
  events: readonly unknown[],
): AuditHistoryValidation {
  const issues: AuditIssue[] = [];
  let prior: JsonObject | undefined;

  for (const [index, candidate] of events.entries()) {
    if (!isJsonObject(candidate)) {
      issues.push(
        issue(
          "AUDIT_EVENT_INVALID",
          index,
          "Audit history entries must be JSON objects.",
        ),
      );
      prior = undefined;
      continue;
    }

    const event = candidate;
    validateShape(event, index, issues);

    const ordinal = event.appendOrdinal;
    const expectedOrdinal = index + 1;
    if (ordinal !== expectedOrdinal) {
      issues.push(
        issue(
          "AUDIT_ORDINAL_GAP",
          index,
          "Append ordinals must begin at 1 and increase without gaps.",
        ),
      );
    }

    if (index === 0) {
      if (event.priorEventContentSha256 !== null) {
        issues.push(
          issue(
            "AUDIT_PREDECESSOR_HASH_MISMATCH",
            index,
            "The first event must have a null predecessor hash.",
          ),
        );
      }
      if (event.eventType !== "artifact-received") {
        issues.push(
          issue(
            "AUDIT_TRANSITION_INVALID",
            index,
            "An artifact audit chain must begin with receipt.",
          ),
        );
      }
    } else if (prior) {
      if (event.priorEventContentSha256 !== prior.eventContentSha256) {
        issues.push(
          issue(
            "AUDIT_PREDECESSOR_HASH_MISMATCH",
            index,
            "The predecessor hash must identify the immediately prior event.",
          ),
        );
      }
      if (event.subjectKey !== prior.subjectKey) {
        issues.push(
          issue(
            "AUDIT_SUBJECT_MISMATCH",
            index,
            "Every event in one chain must concern the same subject.",
          ),
        );
      }
      if (!isPermittedTransition(prior.eventType, event.eventType)) {
        issues.push(
          issue(
            "AUDIT_TRANSITION_INVALID",
            index,
            "The event type is not permitted after its immediate predecessor.",
          ),
        );
      }
    }

    prior = event;
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
  });
}

function validateShape(
  event: JsonObject,
  index: number,
  issues: AuditIssue[],
): void {
  if (
    typeof event.eventId !== "string" ||
    typeof event.eventType !== "string" ||
    !Number.isInteger(event.appendOrdinal) ||
    (event.appendOrdinal as number) < 1 ||
    typeof event.subjectKey !== "string" ||
    !isJsonObject(event.deterministicPayload) ||
    !isJsonObject(event.actor) ||
    typeof event.occurredAt !== "string" ||
    typeof event.ruleSetVersion !== "string"
  ) {
    issues.push(
      issue(
        "AUDIT_EVENT_INVALID",
        index,
        "The event is missing a required typed audit field.",
      ),
    );
  }

  if (
    !isSha256OrNull(event.priorEventContentSha256) ||
    !isSha256(event.eventContentSha256)
  ) {
    issues.push(
      issue(
        "AUDIT_EVENT_HASH_INVALID",
        index,
        "Audit hashes must be null where allowed or lowercase SHA-256 values.",
      ),
    );
  }
}

function isPermittedTransition(previous: unknown, next: unknown): boolean {
  if (typeof previous !== "string" || typeof next !== "string") return false;
  if (next === "artifact-received") return false;
  if (previous === "artifact-received") return next === "artifact-preserved";
  if (previous === "artifact-preserved") return next !== "artifact-preserved";
  return previous !== next;
}

function decoded(
  events: readonly unknown[],
  truncatedFinalLine: boolean,
): DecodedAuditJsonl {
  return Object.freeze({
    events: Object.freeze([...events]),
    truncatedFinalLine,
  });
}

function issue(
  code: AuditIssue["code"],
  eventIndex: number,
  message: string,
): AuditIssue {
  return Object.freeze({ code, eventIndex, message });
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && sha256Pattern.test(value);
}

function isSha256OrNull(value: unknown): value is string | null {
  return value === null || isSha256(value);
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

import { validateContract } from "../../contracts/schema-validator";
import { canonicalize } from "../../domain/manifests/canonical-json";
import { validateRuleRecord } from "../../domain/plan-rules/rule-authoring";
import type { PlanRuleRecord } from "../../domain/plan-rules/models";
import type { WorkspacePort } from "../../domain/ports";
import { parseUtcTimestamp, type Uuid } from "../../domain/shared/types";

const MAX_LOG_BYTES = 16 * 1024 * 1024;
const CHUNK_SIZE = 64 * 1024;
type HistoryResult =
  | { readonly ok: true; readonly rules: readonly PlanRuleRecord[] }
  | { readonly ok: false; readonly message: string };

/** Checks local log consistency only. This is not an authenticated history. */
export async function readPlanRuleHistory<StorageError>(
  workspace: Pick<WorkspacePort<StorageError>, "openChunkReader">,
  caseId: Uuid,
): Promise<HistoryResult> {
  const failure = (message: string): HistoryResult => ({ ok: false, message });
  try {
    const readLines = async (path: string): Promise<readonly unknown[]> => {
      const opened = await workspace.openChunkReader(path);
      if (!opened.ok) {
        const error: unknown = opened.error;
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "NOT_FOUND"
        )
          return [];
        throw new Error("A rule history log could not be opened.");
      }
      const size = opened.value.sizeBytes;
      if (!Number.isSafeInteger(size) || size < 0 || size > MAX_LOG_BYTES)
        throw new Error("A rule history log exceeds the supported size.");
      const bytes = new Uint8Array(size);
      for (let offset = 0; offset < size;) {
        const length = Math.min(CHUNK_SIZE, size - offset);
        const chunk = await opened.value.read({
          offsetBytes: offset,
          lengthBytes: length,
        });
        if (
          !chunk.ok ||
          chunk.value.offsetBytes !== offset ||
          chunk.value.bytes.length !== length ||
          chunk.value.endOfSource !== (offset + length === size)
        )
          throw new Error("A rule history log could not be read safely.");
        bytes.set(chunk.value.bytes, offset);
        offset += length;
      }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text === "") return [];
      if (!text.endsWith("\n"))
        throw new Error("A rule history log is incomplete.");
      return text
        .slice(0, -1)
        .split("\n")
        .map((line): unknown => JSON.parse(line) as unknown);
    };
    const [records, events] = await Promise.all([
      readLines(`cases/${caseId}/evidence/rule-records.jsonl`),
      readLines(`cases/${caseId}/reviews/events.jsonl`),
    ]);
    const byId = new Map<Uuid, PlanRuleRecord>();
    for (const value of records) {
      if (!validateContract("planRuleRecord", value).valid)
        return failure("A plan-rule record has an invalid contract.");
      const rule = value as PlanRuleRecord;
      if (!(await validateRuleRecord(rule)).ok)
        return failure("A plan-rule record has invalid content.");
      if (byId.has(rule.ruleId))
        return failure("The plan-rule history contains duplicate identities.");
      const previousLink = rule.supersessionChain.at(-1);
      if (previousLink !== undefined) {
        const previous =
          previousLink.predecessorRuleId === null
            ? undefined
            : byId.get(previousLink.predecessorRuleId);
        if (previous === undefined)
          return failure(
            "The plan-rule supersession history is incomplete or inconsistent.",
          );
        if (
          previousLink.predecessorRuleContentSha256 !==
            previous.ruleContentSha256 ||
          previous.affectedScope !== rule.affectedScope ||
          previousLink.effectiveDate !== rule.effectiveDate ||
          rule.effectiveDate <= previous.effectiveDate ||
          (previous.endDate !== null &&
            previous.endDate > rule.effectiveDate) ||
          canonicalize(rule.supersessionChain.slice(0, -1)) !==
            canonicalize(previous.supersessionChain)
        )
          return failure(
            "The plan-rule supersession history is incomplete or inconsistent.",
          );
      }
      byId.set(rule.ruleId, rule);
    }
    const linked = new Set<Uuid>();
    for (const value of events) {
      if (
        typeof value !== "object" ||
        value === null ||
        !("eventType" in value)
      )
        return failure("A review event is invalid.");
      if (value.eventType !== "plan-rule-recorded") continue;
      if (!("ruleId" in value) || typeof value.ruleId !== "string")
        return failure("A plan-rule review event is invalid.");
      const rule = byId.get(value.ruleId as Uuid);
      if (
        !rule ||
        linked.has(rule.ruleId) ||
        !("ruleContentSha256" in value) ||
        value.ruleContentSha256 !== rule.ruleContentSha256 ||
        !("effectiveDate" in value) ||
        value.effectiveDate !== rule.effectiveDate ||
        !("recordedAt" in value) ||
        typeof value.recordedAt !== "string" ||
        !parseUtcTimestamp(value.recordedAt).ok ||
        !("schemaVersion" in value) ||
        value.schemaVersion !== "1.0.0"
      )
        return failure(
          "A plan-rule review event does not match one saved rule.",
        );
      linked.add(rule.ruleId);
    }
    if (linked.size !== byId.size)
      return failure("A saved plan-rule record is missing its review event.");
    return { ok: true, rules: Object.freeze([...byId.values()]) };
  } catch {
    return failure("The plan-rule history could not be read or verified.");
  }
}

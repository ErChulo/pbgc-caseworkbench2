import { hashTyped } from "../manifests/canonical-json";
import { parseSha256, parseUuid, type Uuid } from "../shared/types";
import { PLAN_SUMMARY_SECTIONS, type PlanSummaryRecord } from "./models";

/** Verify only an empty draft; populated summaries require a governed replay. */
export async function verifyEmptyPlanSummaryDraft(
  value: unknown,
  caseId: Uuid,
): Promise<PlanSummaryRecord | null> {
  try {
    const copy: unknown = structuredClone(value);
    if (
      !isRecord(copy) ||
      !hasKeys(copy, [
        "recordId",
        "caseId",
        "schemaVersion",
        "sections",
        "overallStatus",
        "lastApprovedAt",
        "lastApprovedBy",
        "recordContentSha256",
      ]) ||
      copy.caseId !== caseId ||
      typeof copy.recordId !== "string" ||
      !parseUuid(copy.recordId).ok ||
      copy.schemaVersion !== "1.0.0" ||
      copy.overallStatus !== "draft" ||
      copy.lastApprovedAt !== null ||
      copy.lastApprovedBy !== null ||
      typeof copy.recordContentSha256 !== "string" ||
      !parseSha256(copy.recordContentSha256).ok ||
      !Array.isArray(copy.sections) ||
      copy.sections.length !== PLAN_SUMMARY_SECTIONS.length
    )
      return null;
    const emptyHash = await hashTyped([], { typeName: "PlanSummarySection" });
    for (let i = 0; i < PLAN_SUMMARY_SECTIONS.length; i++) {
      const section: unknown = copy.sections[i];
      const expected = PLAN_SUMMARY_SECTIONS[i];
      if (
        !isRecord(section) ||
        expected === undefined ||
        !hasKeys(section, [
          "sectionId",
          "sectionTitle",
          "attributes",
          "sectionContentSha256",
        ]) ||
        section.sectionId !== expected.sectionId ||
        section.sectionTitle !== expected.sectionTitle ||
        !Array.isArray(section.attributes) ||
        section.attributes.length !== 0 ||
        section.sectionContentSha256 !== emptyHash
      )
        return null;
    }
    const { recordContentSha256, ...payload } = copy;
    if (
      (await hashTyped(payload, { typeName: "PlanSummaryRecord" })) !==
      recordContentSha256
    )
      return null;
    return copy as unknown as PlanSummaryRecord;
  } catch {
    return null;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

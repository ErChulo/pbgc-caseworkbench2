import { validateContract } from "../../contracts/schema-validator";
import { hashTyped } from "../manifests/canonical-json";
import type { Uuid } from "../shared/types";
import type { DraftV1SummaryArtifact } from "./models";

/** Checks case and deterministic content consistency, not source authority or derivation. */
export async function verifyDraftV1SummaryArtifact(
  value: unknown,
  caseId: Uuid,
): Promise<DraftV1SummaryArtifact | null> {
  try {
    const snapshot: unknown = structuredClone(value);
    if (!validateContract("draftV1Summary", snapshot).valid) return null;
    const draft = snapshot as DraftV1SummaryArtifact;
    if (
      draft.deterministicPayload.caseId !== caseId ||
      (await hashTyped(draft.deterministicPayload, {
        typeName: "DraftV1SummaryArtifact",
      })) !== draft.contentSha256
    )
      return null;
    return draft;
  } catch {
    return null;
  }
}

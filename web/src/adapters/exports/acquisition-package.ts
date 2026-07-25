import type { AcquisitionRecord } from "../../domain/acquisition/models";
import { deterministicSha256 } from "../../domain/normalization/normalizer";
import type { Result } from "../../domain/shared/types";

export async function validateLocalAcquisitionPackage(
  record: AcquisitionRecord,
): Promise<Result<AcquisitionRecord, string>> {
  if (
    (record.deterministicPackagePayload as { readonly policy?: unknown })
      .policy !== "local-only-no-transmission"
  )
    return {
      ok: false,
      error: "Acquisition package policy must prohibit transmission.",
    };
  if (
    (await deterministicSha256(record.deterministicRequestPayload, {
      schemaId: "evidence-acquisition.schema.json",
    })) !== record.requestPayloadSha256 ||
    (await deterministicSha256(record.deterministicPackagePayload, {
      schemaId: "evidence-acquisition.schema.json",
    })) !== record.packagePayloadSha256
  )
    return {
      ok: false,
      error: "Acquisition package deterministic hash is invalid.",
    };
  if (
    record.deterministicProposalPayload !== null &&
    ((await deterministicSha256(record.deterministicProposalPayload, {
      schemaId: "evidence-acquisition.schema.json",
    })) !== record.proposalPayloadSha256 ||
      record.deterministicProposalPayload.requestPayloadSha256 !==
        record.requestPayloadSha256 ||
      record.deterministicProposalPayload.packagePayloadSha256 !==
        record.packagePayloadSha256)
  )
    return {
      ok: false,
      error: "Returned proposal linkage or hash is invalid.",
    };
  return { ok: true, value: record };
}

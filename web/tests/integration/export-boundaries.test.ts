import { describe, expect, it } from "vitest";

import { validateLocalAcquisitionPackage } from "../../src/adapters/exports/acquisition-package";
import { deterministicSha256 } from "../../src/domain/normalization/normalizer";
import {
  parseSha256,
  parseUtcTimestamp,
  type Sha256,
} from "../../src/domain/shared/types";

describe("T106 local acquisition boundary", () => {
  it("validates local-only packages and rejects transmission policy or stale hashes", async () => {
    const request = {
      requestingModuleId: "synthetic-module",
      missingFacts: [],
      candidateDocumentOrReportTypes: ["synthetic-report"],
      sourcePriorityRecommendations: [],
      extractionSchemaRegistrations: [],
      extractionInstructionRegistrations: [],
      rerunTrigger: null,
    };
    const requestHash = await deterministicSha256(request, {
      schemaId: "evidence-acquisition.schema.json",
    });
    const packagePayload = {
      requestPayloadSha256: requestHash,
      artifactSha256Values: [sha("a".repeat(64))],
      extractionSchemaRegistrations: [],
      extractionInstructionRegistrations: [],
      policy: "local-only-no-transmission" as const,
    };
    const packageHash = await deterministicSha256(packagePayload, {
      schemaId: "evidence-acquisition.schema.json",
    });
    const time = parseUtcTimestamp("2026-01-01T00:00:00Z");
    if (!time.ok) throw new Error("time");
    const record = {
      schemaVersion: "1.0.0" as const,
      deterministicRequestPayload: request,
      requestPayloadSha256: requestHash,
      deterministicPackagePayload: packagePayload,
      packagePayloadSha256: packageHash,
      deterministicProposalPayload: null,
      proposalPayloadSha256: null,
      operationalMetadata: {
        requestRecordId: "local",
        createdAt: time.value,
        storagePath: null,
        runtimeStatus: "created",
      },
    };
    expect((await validateLocalAcquisitionPackage(record)).ok).toBe(true);
    expect(
      (
        await validateLocalAcquisitionPackage({
          ...record,
          packagePayloadSha256: sha("b".repeat(64)),
        })
      ).ok,
    ).toBe(false);
    expect(JSON.stringify(record)).not.toMatch(
      /external.?llm|transmit control|benefit calculation|plan interpretation/iu,
    );
  });
});

function sha(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new Error("sha");
  return parsed.value;
}

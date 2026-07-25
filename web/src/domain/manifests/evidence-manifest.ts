import type {
  AcquisitionLineageNode,
  PromotedFact,
  ProposalDecisionRecord,
} from "../acquisition/models";
import { replayProposalDecisions } from "../acquisition/proposal-validator";
import type { Reconciliation } from "./reconciliation";
import {
  populationManifestHash,
  validatePopulationEvidence,
  type PopulationCandidateDecision,
  type PopulationCandidateProfile,
  type PopulationEvidenceObservation,
} from "../population/population-profile";
import { deterministicSha256 } from "../normalization/normalizer";
import type { Sha256 } from "../shared/types";
import type { UnresolvedItem } from "../review/unresolved-items";

export interface ManifestArtifact {
  readonly artifactKey: string;
  readonly sha256: Sha256;
  readonly sourceLocator: string;
  readonly downstreamEligibility: "blocked" | "provisional";
}

export interface EvidenceManifestPayload {
  readonly snapshotId: Sha256;
  readonly artifacts: readonly ManifestArtifact[];
  readonly populationEvidenceObservations: readonly PopulationEvidenceObservation[];
  readonly populationCandidates: readonly PopulationCandidateProfile[];
  readonly unresolvedItems: readonly UnresolvedItem[];
  readonly validationResults: readonly {
    readonly validationKey: Sha256;
    readonly outcome: string;
    readonly blocksDownstream: boolean;
  }[];
  readonly acquisitionLineageNodes: readonly AcquisitionLineageNode[];
  readonly promotedFacts: readonly PromotedFact[];
}

export interface EvidenceManifest {
  readonly schemaVersion: "1.0.0";
  readonly producerVersion: string;
  readonly ruleSetVersion: string;
  readonly deterministicPayload: EvidenceManifestPayload;
  readonly contentManifestId: Sha256;
  readonly reconciliationTotals: Reconciliation;
  readonly operationalMetadata: {
    readonly generatedAt: string;
    readonly runId: string;
    readonly proposalDecisions: readonly ProposalDecisionRecord[];
    readonly populationDecisions: readonly PopulationCandidateDecision[];
  };
}

export async function assembleEvidenceManifest(
  input: Omit<EvidenceManifest, "contentManifestId">,
): Promise<EvidenceManifest> {
  validateUnique(
    input.deterministicPayload.artifacts.map((item) => item.artifactKey),
  );
  const hashes = input.deterministicPayload.artifacts.map(
    (item) => item.sha256,
  );
  for (const candidate of input.deterministicPayload.populationCandidates) {
    const validation = await validatePopulationEvidence(
      candidate,
      input.deterministicPayload.populationEvidenceObservations,
      hashes,
    );
    if (!validation.ok) throw new TypeError(validation.error.safeMessage);
  }
  validateUnique(
    input.deterministicPayload.unresolvedItems.map((item) => item.itemKey),
  );
  validateUnique(
    input.deterministicPayload.acquisitionLineageNodes.map(
      (item) => item.nodeId,
    ),
  );
  const contentManifestId = await deterministicSha256(
    { deterministicPayload: input.deterministicPayload },
    { schemaId: "evidence-manifest.schema.json" },
  );
  return Object.freeze({ ...input, contentManifestId });
}

export async function assertGovernedProposalUse(
  proposalSha256: Sha256,
  decisions: readonly ProposalDecisionRecord[],
): Promise<void> {
  const replay = await replayProposalDecisions(proposalSha256, decisions);
  if (!replay.ok || replay.value !== "approved")
    throw new TypeError(
      "Governed downstream use requires effective human approval.",
    );
}

export async function populationPayloadHash(
  payload: EvidenceManifestPayload,
): Promise<Sha256> {
  return populationManifestHash({
    artifacts: payload.artifacts,
    populationEvidenceObservations: payload.populationEvidenceObservations,
    populationCandidates: payload.populationCandidates,
  });
}

function validateUnique(values: readonly (string | Sha256)[]): void {
  if (new Set(values).size !== values.length)
    throw new TypeError("Manifest deterministic identities must be unique.");
}

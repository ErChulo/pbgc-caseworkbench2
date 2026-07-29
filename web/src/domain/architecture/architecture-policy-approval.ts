import { validateContract } from "../../contracts/schema-validator";
import { catalogContentSha256 } from "../evidence/catalog";
import type { EvidenceCatalog } from "../evidence/models";
import { hashTyped } from "../manifests/canonical-json";
import type { HumanActor } from "../quarantine/models";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Result,
  type Sha256,
  type UtcTimestamp,
  type Uuid,
} from "../shared/types";
import type { PolicyCitation, PolicyKind } from "./models";
import type { RuleSet } from "./rule-loader";

export interface ArchitecturePolicyApproval {
  readonly decisionId: Uuid;
  readonly decisionContentSha256: Sha256;
  readonly appendOrdinal: number;
  readonly priorDecisionId: Uuid | null;
  readonly priorDecisionContentSha256: Sha256 | null;
  readonly decisionType: "approve" | "revoke" | "supersede";
  readonly resultingStatus: "approved" | "revoked" | "superseded";
  readonly policyKind: PolicyKind;
  readonly policyVersion: string;
  readonly policyContentSha256: Sha256;
  readonly sourceFileSha256: Sha256;
  readonly evidenceCatalogId: Uuid;
  readonly evidenceCatalogContentSha256: Sha256;
  readonly evidenceCitations: readonly PolicyCitation[];
  readonly humanActor: HumanActor;
  readonly rationale: string;
  readonly decidedAt: UtcTimestamp;
  readonly schemaVersion: "1.0.0";
}

export interface ArchitecturePolicyProjection {
  readonly status: "approved" | "revoked" | "superseded" | "provisional";
  readonly effectiveDecisionId: Uuid | null;
  readonly effectiveDecisionContentSha256: Sha256 | null;
}

export async function architecturePolicyDecisionContentHash(
  decision:
    | Omit<ArchitecturePolicyApproval, "decisionContentSha256">
    | ArchitecturePolicyApproval,
): Promise<Sha256> {
  const { decisionContentSha256: ignored, ...content } =
    decision as ArchitecturePolicyApproval;
  void ignored;
  const parsed = parseSha256(
    await hashTyped(content, {
      typeName: "ArchitecturePolicyApprovalContent",
    }),
  );
  if (!parsed.ok) throw new Error("Architecture policy decision hash failed.");
  return parsed.value;
}

export async function replayArchitecturePolicyApprovals(
  policy: RuleSet,
  decisions: readonly ArchitecturePolicyApproval[],
  catalog: EvidenceCatalog,
): Promise<Result<ArchitecturePolicyProjection, string>> {
  if ((await catalogContentSha256(catalog)) !== catalog.catalogContentSha256)
    return failure("Evidence catalog content hash is invalid.");

  let prior: ArchitecturePolicyApproval | null = null;
  const seen = new Set<string>();
  for (const decision of decisions) {
    if (!validateContract("architecturePolicyApproval", decision).valid)
      return failure("Policy decision does not satisfy its governed schema.");
    if (
      !parseUuid(decision.decisionId).ok ||
      !parseUtcTimestamp(decision.decidedAt).ok ||
      (decision.humanActor as { readonly actorType?: unknown }).actorType !==
        "human" ||
      decision.humanActor.actorKey.trim() === "" ||
      decision.rationale.trim() === ""
    )
      return failure(
        "Policy decisions require valid IDs, timestamps, a human actor, and rationale.",
      );
    if (
      decision.policyKind !== policy.kind ||
      decision.policyVersion !== policy.version ||
      decision.policyContentSha256 !== policy.policyContentSha256 ||
      decision.sourceFileSha256 !== policy.sourceFileSha256
    )
      return failure("Policy decision does not bind the exact loaded policy.");
    if (
      decision.evidenceCatalogId !== catalog.catalogId ||
      decision.evidenceCatalogContentSha256 !== catalog.catalogContentSha256
    )
      return failure(
        "Policy decision does not bind the validated evidence catalog.",
      );
    if (decision.evidenceCitations.length === 0)
      return failure("Policy decision has no evidence citations.");
    for (const citation of decision.evidenceCitations) {
      if (
        citation.sourceLocator.trim() === "" ||
        !validDate(citation.effectiveDate) ||
        (citation.adoptionDate !== null && !validDate(citation.adoptionDate))
      )
        return failure("Policy citation metadata is invalid.");
      const matches = [
        ...catalog.caseEvidence,
        ...catalog.referenceOnly,
      ].filter(
        (artifact) =>
          artifact.sha256 === citation.sourceArtifactSha256 &&
          artifact.reviewStatus === "released",
      );
      if (matches.length !== 1)
        return failure(
          "Policy citation does not resolve once to released evidence.",
        );
      if (
        citation.supersedesArtifactSha256 !== null &&
        [...catalog.caseEvidence, ...catalog.referenceOnly].filter(
          (artifact) =>
            artifact.sha256 === citation.supersedesArtifactSha256 &&
            artifact.reviewStatus === "released",
        ).length !== 1
      )
        return failure(
          "Policy supersession citation does not resolve to released evidence.",
        );
    }
    if (
      seen.has(decision.decisionId) ||
      decision.appendOrdinal !== (prior?.appendOrdinal ?? 0) + 1 ||
      (prior === null &&
        (decision.priorDecisionId !== null ||
          decision.priorDecisionContentSha256 !== null)) ||
      (prior !== null &&
        (decision.priorDecisionId !== prior.decisionId ||
          decision.priorDecisionContentSha256 !== prior.decisionContentSha256 ||
          decision.decidedAt <= prior.decidedAt))
    )
      return failure(
        "Policy approval chain must be gapless, unbranched, and hash-bound.",
      );
    if (
      (await architecturePolicyDecisionContentHash(decision)) !==
      decision.decisionContentSha256
    )
      return failure("Policy decision content hash is invalid.");
    if (!validTransition(prior?.resultingStatus ?? null, decision))
      return failure("Policy decision transition is invalid.");
    prior = decision;
    seen.add(decision.decisionId);
  }
  return {
    ok: true,
    value: {
      status: prior?.resultingStatus ?? "provisional",
      effectiveDecisionId: prior?.decisionId ?? null,
      effectiveDecisionContentSha256: prior?.decisionContentSha256 ?? null,
    },
  };
}

function validTransition(
  prior: ArchitecturePolicyApproval["resultingStatus"] | null,
  decision: ArchitecturePolicyApproval,
): boolean {
  if (prior === null)
    return (
      decision.decisionType === "approve" &&
      decision.resultingStatus === "approved"
    );
  if (prior === "approved")
    return (
      (decision.decisionType === "revoke" &&
        decision.resultingStatus === "revoked") ||
      (decision.decisionType === "supersede" &&
        decision.resultingStatus === "superseded")
    );
  return false;
}

function failure(error: string): Result<never, string> {
  return { ok: false, error };
}

function validDate(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !Number.isNaN(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

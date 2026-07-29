import { describe, expect, it } from "vitest";

import {
  buildEvidenceCatalog,
  buildEvidenceCatalogFromScreenedOutcomes,
  type BuildCatalogInput,
  type ScreenedCatalogAdapterInput,
} from "../../../../src/domain/evidence/catalog";
import { classificationDecisionContentHash } from "../../../../src/domain/classification/classification-review";
import type {
  ClassificationApproval,
  ClassificationProposal,
} from "../../../../src/domain/classification/models";
import { createUnresolvedItem } from "../../../../src/domain/plan-rules/unresolved-items";
import { quarantineDecisionContentHash } from "../../../../src/domain/quarantine/release-service";
import type { QuarantineDecision } from "../../../../src/domain/quarantine/models";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Sha256,
  type UtcTimestamp,
  type Uuid,
} from "../../../../src/domain/shared/types";

const baseInput: BuildCatalogInput = {
  catalogId: "00000000-0000-4000-8000-000000000001",
  caseId: "00000000-0000-4000-8000-000000000002",
  builtAt: "2026-07-28T12:00:00.000Z",
  caseEvidence: [
    {
      artifactId: "00000000-0000-4000-8000-000000000011",
      sha256: "b".repeat(64),
      sizeBytes: 1024,
      locator: "synthetic/plan.pdf",
      mediaType: "application/pdf",
      receiptId: "00000000-0000-4000-8000-000000000021",
      receiptIds: ["00000000-0000-4000-8000-000000000021"],
      exactDuplicateOfSha256: null,
      containedBySha256: null,
      sourceRole: "executed-plan-document",
      reviewStatus: "released",
      importedAt: "2026-07-28T11:00:00.000Z",
    },
    {
      artifactId: "00000000-0000-4000-8000-000000000012",
      sha256: "a".repeat(64),
      sizeBytes: 256,
      locator: "synthetic/amendment.pdf",
      mediaType: "application/pdf",
      receiptId: "00000000-0000-4000-8000-000000000022",
      receiptIds: ["00000000-0000-4000-8000-000000000022"],
      exactDuplicateOfSha256: null,
      containedBySha256: "b".repeat(64),
      sourceRole: "amendment",
      reviewStatus: "released",
      importedAt: "2026-07-28T11:01:00.000Z",
    },
  ],
  referenceOnly: [],
  excludedQuarantined: [
    {
      artifactId: "00000000-0000-4000-8000-000000000013",
      sha256: "c".repeat(64),
      quarantineDecisionId: "00000000-0000-4000-8000-000000000031",
      linkedUnresolvedItemId: "00000000-0000-4000-8000-000000000041",
    },
  ],
};

describe("EvidenceCatalog", () => {
  it("sorts governed payloads and computes a real deterministic SHA-256", async () => {
    const first = await buildEvidenceCatalog(baseInput);
    const replay = await buildEvidenceCatalog({
      ...baseInput,
      builtAt: "2026-07-28T13:00:00.000Z",
      caseEvidence: [...baseInput.caseEvidence].reverse(),
    });

    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(true);
    if (!first.ok || !replay.ok) return;
    expect(first.value.caseEvidence.map((item) => item.sha256)).toEqual([
      "a".repeat(64),
      "b".repeat(64),
    ]);
    expect(first.value.catalogContentSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.value.catalogContentSha256).toBe(
      replay.value.catalogContentSha256,
    );
  });

  it("rejects empty inventories without inventing evidence", async () => {
    const result = await buildEvidenceCatalog({
      ...baseInput,
      caseEvidence: [],
      excludedQuarantined: [],
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "EMPTY_INVENTORY" },
    });
  });

  it("rejects duplicate hashes rather than losing receipt provenance", async () => {
    const duplicate = baseInput.caseEvidence[0];
    if (duplicate === undefined) throw new Error("synthetic fixture missing");
    const result = await buildEvidenceCatalog({
      ...baseInput,
      referenceOnly: [
        { ...duplicate, artifactId: "00000000-0000-4000-8000-000000000099" },
      ],
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_SCREENED_OUTCOME" },
    });
  });

  it("rejects malformed inherited metadata", async () => {
    const artifact = baseInput.caseEvidence[0];
    if (artifact === undefined) throw new Error("synthetic fixture missing");
    const result = await buildEvidenceCatalog({
      ...baseInput,
      caseEvidence: [{ ...artifact, sha256: "not-a-hash" }],
    });
    expect(result.ok).toBe(false);
  });

  it("adapts released Feature 009 outcomes with duplicate receipts, containment, references, and quarantine linkage", async () => {
    const input = await screenedInput();
    const result = await buildEvidenceCatalogFromScreenedOutcomes(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const duplicate = result.value.catalog.caseEvidence.find(
      (artifact) => artifact.sha256 === hash("a"),
    );
    expect(duplicate).toMatchObject({
      receiptId: id("021"),
      receiptIds: [id("021"), id("022")],
      exactDuplicateOfSha256: hash("a"),
    });
    expect(
      result.value.catalog.caseEvidence.find(
        (artifact) => artifact.sha256 === hash("c"),
      )?.containedBySha256,
    ).toBe(hash("a"));
    expect(result.value.catalog.referenceOnly).toHaveLength(1);
    expect(result.value.catalog.referenceOnly[0]?.sourceRole).toBe(
      "training-reference",
    );
    expect(result.value.catalog.excludedQuarantined).toEqual([
      {
        artifactId: id("014"),
        sha256: hash("d"),
        quarantineDecisionId: id("034"),
        linkedUnresolvedItemId: id("041"),
      },
    ]);
    expect(result.value.unresolvedItems.map((item) => item.itemId)).toEqual([
      id("041"),
    ]);

    const replay = await buildEvidenceCatalogFromScreenedOutcomes({
      ...input,
      builtAt: "2026-07-28T14:00:00.000Z",
      screenedOutcomes: [...input.screenedOutcomes].reverse(),
      receipts: [...input.receipts].reverse(),
      classificationProposals: [...input.classificationProposals].reverse(),
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.value.catalog.catalogContentSha256).toBe(
        result.value.catalog.catalogContentSha256,
      );
    }

    const policyAsOther = await buildEvidenceCatalogFromScreenedOutcomes({
      ...input,
      classificationProposals: input.classificationProposals.map((proposal) =>
        proposal.artifactSha256 === hash("b")
          ? { ...proposal, proposedValue: "other" }
          : proposal,
      ),
    });
    expect(policyAsOther.ok).toBe(true);
    if (policyAsOther.ok) {
      expect(policyAsOther.value.catalog.referenceOnly[0]?.sourceRole).toBe(
        "other",
      );
    }
  });

  it("fails closed when required Feature 009 adapter metadata is missing", async () => {
    const input = await screenedInput();
    const missingReceipt = await buildEvidenceCatalogFromScreenedOutcomes({
      ...input,
      receipts: input.receipts.filter(
        (receipt) => receipt.receiptId !== id("021"),
      ),
    });
    const missingClassification =
      await buildEvidenceCatalogFromScreenedOutcomes({
        ...input,
        classificationApprovals: input.classificationApprovals.filter(
          (approval) => approval.artifactSha256 !== hash("b"),
        ),
      });
    const missingQuarantineLink =
      await buildEvidenceCatalogFromScreenedOutcomes({
        ...input,
        quarantineMetadata: [],
      });
    expect(missingReceipt.ok).toBe(false);
    expect(missingClassification.ok).toBe(false);
    expect(missingQuarantineLink.ok).toBe(false);
  });
});

const human = {
  actorType: "human" as const,
  actorKey: "synthetic-reviewer",
  displayName: "Synthetic Reviewer",
  authorityContext: "Feature 001 synthetic test",
};

function id(suffix: string): Uuid {
  const parsed = parseUuid(
    `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`,
  );
  if (!parsed.ok) throw new Error("Invalid synthetic UUID.");
  return parsed.value;
}

function hash(character: string): Sha256 {
  const parsed = parseSha256(character.repeat(64));
  if (!parsed.ok) throw new Error("Invalid synthetic SHA-256.");
  return parsed.value;
}

function time(value = "2026-07-28T11:00:00.000Z"): UtcTimestamp {
  const parsed = parseUtcTimestamp(value);
  if (!parsed.ok) throw new Error("Invalid synthetic timestamp.");
  return parsed.value;
}

async function classification(
  sha256: Sha256,
  role: string,
  suffix: string,
): Promise<{
  readonly proposal: ClassificationProposal;
  readonly approval: ClassificationApproval;
}> {
  const proposal: ClassificationProposal = {
    proposalKey: `source-role-${suffix}`,
    artifactSha256: sha256,
    dimension: "source-role",
    proposedValue: role,
    status: "proposed",
    authorityCandidate: true,
    confidence: 1,
    supportingEvidence: [],
    classifierId: "synthetic-classifier",
    classifierVersion: "1.0.0",
    ruleSetVersion: "feature-009-classification-v1",
  };
  const base = {
    approvalId: id(`1${suffix}`),
    appendOrdinal: 1,
    priorApprovalId: null,
    priorApprovalContentSha256: null,
    proposalKey: proposal.proposalKey,
    artifactSha256: sha256,
    decisionType: "approve" as const,
    status: "approved" as const,
    actor: human,
    decidedAt: time(),
    rationale: "Synthetic source-role approval.",
    ruleSetVersion: "feature-009-classification-v1",
    schemaVersion: "1.0.0" as const,
  };
  return {
    proposal,
    approval: {
      ...base,
      decisionContentSha256: await classificationDecisionContentHash(base),
    },
  };
}

async function quarantine(
  sha256: Sha256,
  suffix: string,
  released: boolean,
): Promise<QuarantineDecision> {
  const base = {
    decisionId: id(`03${suffix}`),
    appendOrdinal: 1,
    priorDecisionId: null,
    priorDecisionContentSha256: null,
    artifactSha256: sha256,
    findingIds: [],
    action: released ? ("release" as const) : ("final-quarantine" as const),
    reviewer: human,
    decidedAt: time(),
    rationale: "Synthetic quarantine review.",
    resultingStatus: released
      ? ("released" as const)
      : ("final-quarantine" as const),
    ruleSetVersion: "feature-009-screening-v1",
    schemaVersion: "1.0.0" as const,
  };
  return {
    ...base,
    decisionContentSha256: await quarantineDecisionContentHash(base),
  };
}

async function screenedInput(): Promise<ScreenedCatalogAdapterInput> {
  const caseId = id("002");
  const artifacts = [
    ["011", "021", "a", "submitted-file"],
    ["012", "022", "a", "submitted-file"],
    ["013", "023", "b", "submitted-file"],
    ["015", "025", "c", "extracted-member"],
    ["014", "024", "d", "submitted-file"],
  ] as const;
  const screenedOutcomes = artifacts.map(
    ([artifactSuffix, receiptSuffix, character, artifactRole]) => ({
      artifact: {
        artifactId: id(artifactSuffix),
        receiptId: id(receiptSuffix),
        sha256: hash(character),
        attemptId: id("090"),
        caseId,
        artifactRole,
        signatureMediaType: "text/plain",
        processingStatus: "completed" as const,
        downstreamEligibility: "blocked" as const,
        statusHistory: [],
      },
      screening: {
        artifactSha256: hash(character),
        findings: [],
        provisionalState:
          character === "d"
            ? ("provisional-quarantine" as const)
            : ("screening-pending" as const),
        downstreamBlocked: true as const,
        ruleSetVersion: "feature-009-screening-v1",
      },
      passiveExtractionAttempted: character !== "d",
      downstreamBlocked: true as const,
    }),
  );
  const receipts = artifacts.map(
    ([artifactSuffix, receiptSuffix, character]) => ({
      receiptId: id(receiptSuffix),
      attemptId: id("090"),
      caseId,
      sha256: hash(character),
      originalFilename: `synthetic-${receiptSuffix}.txt`,
      observedRelativePath: `synthetic/${receiptSuffix}.txt`,
      submittedBy: null,
      submittedAt: time(),
      sourceLocation: null,
      transferContext: null,
      declaredDescription: null,
      parentArtifactId: artifactSuffix === "015" ? id("011") : null,
    }),
  );
  const classifications = await Promise.all([
    classification(hash("a"), "executed-plan-document", "1"),
    classification(hash("b"), "training-reference", "2"),
    classification(hash("c"), "amendment", "3"),
  ]);
  const quarantineDecisions = await Promise.all([
    quarantine(hash("a"), "1", true),
    quarantine(hash("b"), "2", true),
    quarantine(hash("c"), "3", true),
    quarantine(hash("d"), "4", false),
  ]);
  const unresolved = await createUnresolvedItem(
    {
      kind: "other",
      affectedScope: `artifact:${hash("d")}`,
      competingInterpretations: [
        {
          interpretationId: id("042"),
          statement: "The quarantined artifact is required evidence.",
          evidence: [],
          sourceCandidateId: null,
        },
        {
          interpretationId: id("043"),
          statement: "The quarantined artifact is not required evidence.",
          evidence: [],
          sourceCandidateId: null,
        },
      ],
      consequence: "Evidence completeness remains unresolved.",
      reviewer: null,
    },
    { uuid: () => id("041"), now: () => time() },
  );
  if (!unresolved.ok) throw new Error(unresolved.error);
  return {
    catalogId: id("001"),
    caseId,
    builtAt: time("2026-07-28T12:00:00.000Z"),
    screenedOutcomes,
    contentObjects: ["a", "b", "c"].map((character) => ({
      sha256: hash(character),
      sizeBytes: 100,
      objectPath: `objects/${character}`,
      preservationStatus: "verified" as const,
      postWriteSha256: hash(character),
      firstPreservedAt: time(),
    })),
    receipts,
    classificationProposals: classifications.map((value) => value.proposal),
    classificationApprovals: classifications.map((value) => value.approval),
    containmentEdges: [
      {
        edgeId: "synthetic-edge",
        parentArtifactId: id("011"),
        childArtifactId: id("015"),
        parentSha256: hash("a"),
        childSha256: hash("c"),
        observedMemberPath: "member.txt",
        normalizedDisplayPath: "member.txt",
        sequence: 1,
        compressedSize: 10,
        expandedSize: 100,
        crc32: null,
        extractionResult: "success",
        extractorId: "synthetic-extractor",
        extractorVersion: "1.0.0",
      },
    ],
    quarantineDecisions,
    eligibilityDecisions: [],
    origins: [
      { artifactSha256: hash("a"), origin: "case-package" },
      { artifactSha256: hash("b"), origin: "reference-library" },
      { artifactSha256: hash("c"), origin: "case-package" },
      { artifactSha256: hash("d"), origin: "case-package" },
    ],
    quarantineMetadata: [
      {
        artifactSha256: hash("d"),
        quarantineDecisionId: id("034"),
        linkedUnresolvedItemId: id("041"),
      },
    ],
    unresolvedItems: [unresolved.value],
  };
}

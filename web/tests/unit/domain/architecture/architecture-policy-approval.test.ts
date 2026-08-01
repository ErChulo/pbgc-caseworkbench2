import { describe, expect, it } from "vitest";
import {
  architecturePolicyDecisionContentHash,
  replayArchitecturePolicyApprovals,
  type ArchitecturePolicyApproval,
} from "../../../../src/domain/architecture/architecture-policy-approval";
import { evidenceCatalog } from "../plan-rules/governed-fixtures";
import type { Sha256, Uuid } from "../../../../src/domain/shared/types";

function sha(label: string): Sha256 {
  const hex = label
    .padEnd(32, "0")
    .slice(0, 32)
    .replace(/[^0-9a-f]/gu, "a");
  return (hex + hex).slice(0, 64) as Sha256;
}

function uuid(label: string): Uuid {
  const hex = label
    .padEnd(32, "0")
    .slice(0, 32)
    .replace(/[^0-9a-f]/gu, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}` as Uuid;
}

const humanActor = {
  actorType: "human" as const,
  actorKey: "synthetic-reviewer",
  displayName: "Synthetic Reviewer",
  authorityContext: "unit-test",
};

async function approveDecision(
  overrides: Partial<ArchitecturePolicyApproval> & {
    policyKind: ArchitecturePolicyApproval["policyKind"];
    policyVersion: string;
    policyContentSha256: Sha256;
    sourceFileSha256: Sha256;
    evidenceCatalogId: Uuid;
    evidenceCatalogContentSha256: Sha256;
  },
): Promise<ArchitecturePolicyApproval> {
  const content = {
    decisionId: uuid("decision"),
    appendOrdinal: 1,
    priorDecisionId: null,
    priorDecisionContentSha256: null,
    decisionType: "approve" as const,
    resultingStatus: "approved" as const,
    evidenceCitations: [
      {
        sourceArtifactSha256: sha("a"),
        sourceLocator: "synthetic/approval",
        effectiveDate: "2020-01-01",
        adoptionDate: null,
        supersedesArtifactSha256: null,
      },
    ],
    humanActor,
    rationale: "Approved for testing.",
    decidedAt: "2026-07-29T12:00:00.000Z" as never,
    schemaVersion: "1.0.0" as const,
    ...overrides,
  };
  return {
    ...content,
    decisionContentSha256: await architecturePolicyDecisionContentHash(content),
  };
}

describe("architecture-policy-approval", () => {
  it("computes a deterministic content hash for a policy decision", async () => {
    const decision = await approveDecision({
      decisionId: uuid("hash-test"),
      policyKind: "tab-selection",
      policyVersion: "1.0.0",
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      evidenceCatalogId: uuid("catalog"),
      evidenceCatalogContentSha256: sha("cc"),
    });
    const hash = await architecturePolicyDecisionContentHash(decision);
    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    const hash2 = await architecturePolicyDecisionContentHash(decision);
    expect(hash).toBe(hash2);
  });

  it("returns provisional status for empty decision chain", async () => {
    const catalog = await evidenceCatalog();
    const ruleSet = {
      kind: "tab-selection" as const,
      version: "1.0.0",
      rules: [] as readonly never[],
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      governance: { reviewStatus: "provisional" as const },
    };
    const result = await replayArchitecturePolicyApprovals(
      ruleSet,
      [],
      catalog,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("provisional");
      expect(result.value.effectiveDecisionId).toBeNull();
    }
  });

  it("rejects when catalog content hash is invalid", async () => {
    const catalog = await evidenceCatalog();
    const ruleSet = {
      kind: "tab-selection" as const,
      version: "1.0.0",
      rules: [] as readonly never[],
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      governance: { reviewStatus: "provisional" as const },
    };
    const tamperedCatalog = {
      ...catalog,
      catalogContentSha256: "0".repeat(64) as Sha256,
    };
    const result = await replayArchitecturePolicyApprovals(
      ruleSet,
      [],
      tamperedCatalog,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("catalog content hash");
  });

  it("rejects when policy content hash does not match the rule set", async () => {
    const catalog = await evidenceCatalog();
    const ruleSet = {
      kind: "tab-selection" as const,
      version: "1.0.0",
      rules: [] as readonly never[],
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      governance: { reviewStatus: "provisional" as const },
    };
    const artifact = catalog.caseEvidence[0];
    if (artifact === undefined) throw new Error("Missing catalog artifact.");
    const decision = await approveDecision({
      decisionId: uuid("mismatch"),
      policyKind: "tab-selection",
      policyVersion: "1.0.0",
      policyContentSha256: sha("dd"),
      sourceFileSha256: sha("bb"),
      evidenceCatalogId: catalog.catalogId,
      evidenceCatalogContentSha256: catalog.catalogContentSha256,
      evidenceCitations: [
        {
          sourceArtifactSha256: artifact.sha256,
          sourceLocator: "synthetic/mismatch",
          effectiveDate: "2020-01-01",
          adoptionDate: null,
          supersedesArtifactSha256: null,
        },
      ],
    });
    const result = await replayArchitecturePolicyApprovals(
      ruleSet,
      [decision],
      catalog,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("does not bind");
  });

  it("rejects when chain has a gap in append ordinal", async () => {
    const catalog = await evidenceCatalog();
    const ruleSet = {
      kind: "tab-selection" as const,
      version: "1.0.0",
      rules: [] as readonly never[],
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      governance: { reviewStatus: "provisional" as const },
    };
    const artifact = catalog.caseEvidence[0];
    if (artifact === undefined) throw new Error("Missing catalog artifact.");
    const first = await approveDecision({
      decisionId: uuid("first"),
      appendOrdinal: 1,
      policyKind: "tab-selection",
      policyVersion: "1.0.0",
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      evidenceCatalogId: catalog.catalogId,
      evidenceCatalogContentSha256: catalog.catalogContentSha256,
      evidenceCitations: [
        {
          sourceArtifactSha256: artifact.sha256,
          sourceLocator: "synthetic/first",
          effectiveDate: "2020-01-01",
          adoptionDate: null,
          supersedesArtifactSha256: null,
        },
      ],
    });
    const second = await approveDecision({
      decisionId: uuid("second"),
      appendOrdinal: 3,
      priorDecisionId: first.decisionId,
      priorDecisionContentSha256: first.decisionContentSha256,
      policyKind: "tab-selection",
      policyVersion: "1.0.0",
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      evidenceCatalogId: catalog.catalogId,
      evidenceCatalogContentSha256: catalog.catalogContentSha256,
      evidenceCitations: [
        {
          sourceArtifactSha256: artifact.sha256,
          sourceLocator: "synthetic/second",
          effectiveDate: "2020-01-01",
          adoptionDate: null,
          supersedesArtifactSha256: null,
        },
      ],
      decidedAt: "2026-07-29T13:00:00.000Z" as never,
    });
    const result = await replayArchitecturePolicyApprovals(
      ruleSet,
      [first, second],
      catalog,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("gapless");
  });

  it("rejects an invalid state transition (approved -> approved)", async () => {
    const catalog = await evidenceCatalog();
    const ruleSet = {
      kind: "tab-selection" as const,
      version: "1.0.0",
      rules: [] as readonly never[],
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      governance: { reviewStatus: "provisional" as const },
    };
    const artifact = catalog.caseEvidence[0];
    if (artifact === undefined) throw new Error("Missing catalog artifact.");
    const first = await approveDecision({
      decisionId: uuid("first"),
      appendOrdinal: 1,
      policyKind: "tab-selection",
      policyVersion: "1.0.0",
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      evidenceCatalogId: catalog.catalogId,
      evidenceCatalogContentSha256: catalog.catalogContentSha256,
      evidenceCitations: [
        {
          sourceArtifactSha256: artifact.sha256,
          sourceLocator: "synthetic/first-approve",
          effectiveDate: "2020-01-01",
          adoptionDate: null,
          supersedesArtifactSha256: null,
        },
      ],
    });
    const second = await approveDecision({
      decisionId: uuid("second"),
      appendOrdinal: 2,
      priorDecisionId: first.decisionId,
      priorDecisionContentSha256: first.decisionContentSha256,
      decisionType: "approve" as const,
      resultingStatus: "approved" as const,
      policyKind: "tab-selection",
      policyVersion: "1.0.0",
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      evidenceCatalogId: catalog.catalogId,
      evidenceCatalogContentSha256: catalog.catalogContentSha256,
      evidenceCitations: [
        {
          sourceArtifactSha256: artifact.sha256,
          sourceLocator: "synthetic/second-approve",
          effectiveDate: "2020-01-01",
          adoptionDate: null,
          supersedesArtifactSha256: null,
        },
      ],
      decidedAt: "2026-07-29T13:00:00.000Z" as never,
    });
    const result = await replayArchitecturePolicyApprovals(
      ruleSet,
      [first, second],
      catalog,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("transition is invalid");
  });

  it("rejects a decision that fails schema validation (empty citations)", async () => {
    const catalog = await evidenceCatalog();
    const ruleSet = {
      kind: "tab-selection" as const,
      version: "1.0.0",
      rules: [] as readonly never[],
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      governance: { reviewStatus: "provisional" as const },
    };
    const decision = await approveDecision({
      decisionId: uuid("no-citations"),
      policyKind: "tab-selection",
      policyVersion: "1.0.0",
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      evidenceCatalogId: catalog.catalogId,
      evidenceCatalogContentSha256: catalog.catalogContentSha256,
      evidenceCitations: [],
    });
    const result = await replayArchitecturePolicyApprovals(
      ruleSet,
      [decision],
      catalog,
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain("does not satisfy its governed schema");
  });

  it("accepts a valid approve -> revoke chain", async () => {
    const catalog = await evidenceCatalog();
    const ruleSet = {
      kind: "tab-selection" as const,
      version: "1.0.0",
      rules: [] as readonly never[],
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      governance: { reviewStatus: "provisional" as const },
    };
    const artifact = catalog.caseEvidence[0];
    if (artifact === undefined) throw new Error("Missing catalog artifact.");
    const citation = {
      sourceArtifactSha256: artifact.sha256,
      sourceLocator: "synthetic/chain",
      effectiveDate: "2020-01-01",
      adoptionDate: null,
      supersedesArtifactSha256: null,
    };
    const approve = await approveDecision({
      decisionId: uuid("a1"),
      appendOrdinal: 1,
      policyKind: "tab-selection",
      policyVersion: "1.0.0",
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      evidenceCatalogId: catalog.catalogId,
      evidenceCatalogContentSha256: catalog.catalogContentSha256,
      evidenceCitations: [citation],
    });
    const revoke = await approveDecision({
      decisionId: uuid("r1"),
      appendOrdinal: 2,
      priorDecisionId: approve.decisionId,
      priorDecisionContentSha256: approve.decisionContentSha256,
      decisionType: "revoke" as const,
      resultingStatus: "revoked" as const,
      policyKind: "tab-selection",
      policyVersion: "1.0.0",
      policyContentSha256: sha("aa"),
      sourceFileSha256: sha("bb"),
      evidenceCatalogId: catalog.catalogId,
      evidenceCatalogContentSha256: catalog.catalogContentSha256,
      evidenceCitations: [citation],
      decidedAt: "2026-07-29T13:00:00.000Z" as never,
    });
    const result = await replayArchitecturePolicyApprovals(
      ruleSet,
      [approve, revoke],
      catalog,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("revoked");
  });
});

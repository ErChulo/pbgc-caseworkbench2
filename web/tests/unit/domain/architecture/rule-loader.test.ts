import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  effectivePolicyApproval,
  loadRuleSet,
  loadRuleSets,
  policyContentHash,
  resolveRulePath,
} from "../../../../src/domain/architecture/rule-loader";
import {
  architecturePolicyDecisionContentHash,
  type ArchitecturePolicyApproval,
} from "../../../../src/domain/architecture/architecture-policy-approval";
import type { Sha256, Uuid } from "../../../../src/domain/shared/types";
import { evidenceCatalog } from "../plan-rules/governed-fixtures";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const rulesDir = resolve(currentDirectory, "../../../../../rules");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryRule(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "architecture-rule-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "rule.yaml");
  await writeFile(path, content, "utf8");
  return path;
}

describe("rule-loader", () => {
  it.each([
    ["scenario-selection", "scenario-selection.yaml"],
    ["tab-selection", "tab-selection.yaml"],
    ["iob-classification", "iob-classification.yaml"],
    ["field-name-glossary", "field-name-glossary.yaml"],
  ] as const)(
    "strictly loads %s as a provisional candidate",
    async (kind, name) => {
      const result = await loadRuleSet(resolve(rulesDir, name), kind);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.governance.reviewStatus).toBe("provisional");
      expect(result.value.governance).toEqual({ reviewStatus: "provisional" });
      expect(result.value.policyContentSha256).toMatch(/^[0-9a-f]{64}$/u);
    },
  );

  it("loads all four candidate sets with deterministic hashes", async () => {
    const first = await loadRuleSets(rulesDir);
    const second = await loadRuleSets(rulesDir);
    expect(first).toEqual(second);
  });

  it("fails closed in production mode while approval evidence is absent", async () => {
    const result = await loadRuleSets(rulesDir, "production");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RULE_NOT_APPROVED");
  });

  it.each([
    [
      "unknown field",
      '\nunknownPolicyField: "not-allowed"',
      "RULE_VALIDATION_ERROR",
    ],
    ["wrong type", '\nversion: "replacement"', "RULE_PARSE_ERROR"],
  ] as const)("rejects %s", async (_label, addition, expectedCode) => {
    const source = await readFile(
      resolve(rulesDir, "tab-selection.yaml"),
      "utf8",
    );
    const content =
      expectedCode === "RULE_PARSE_ERROR"
        ? source.replace('version: "1.0.0"', 'version: "1.0.0"\n\tbad: true')
        : `${source}${addition}\n`;
    const result = await loadRuleSet(
      await temporaryRule(content),
      "tab-selection",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(expectedCode);
  });

  it("rejects nulls, invalid dates, invalid enum values, and duplicate keys", async () => {
    const source = await readFile(
      resolve(rulesDir, "scenario-selection.yaml"),
      "utf8",
    );
    const mutations = [
      source.replace('label: "Death of Retiree"', "label: null"),
      source.replace('startDate: "1974-09-02"', 'startDate: "2026-02-30"'),
      source.replace('operator: "present"', 'operator: "sometimes"'),
      source.replace(
        'label: "Death of Retiree"',
        'label: "Death of Retiree"\n    label: "Duplicate"',
      ),
    ];
    for (const content of mutations) {
      const result = await loadRuleSet(
        await temporaryRule(content),
        "scenario-selection",
      );
      expect(result.ok).toBe(false);
    }
  });

  it("rejects embedded self-approval metadata", async () => {
    const source = await readFile(
      resolve(rulesDir, "tab-selection.yaml"),
      "utf8",
    );
    const result = await loadRuleSet(
      await temporaryRule(
        source.replace(
          'reviewStatus: "provisional"',
          'reviewStatus: "approved"\n  reviewedBy: "forged"',
        ),
      ),
      "tab-selection",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RULE_VALIDATION_ERROR");
  });

  it("returns a typed error for a missing file", async () => {
    const result = await loadRuleSet(
      resolve(rulesDir, "missing.yaml"),
      "scenario-selection",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RULE_FILE_NOT_FOUND");
  });

  it("computes a deterministic policy content hash from rule payload", async () => {
    const first = await loadRuleSet(
      resolve(rulesDir, "scenario-selection.yaml"),
      "scenario-selection",
    );
    const second = await loadRuleSet(
      resolve(rulesDir, "scenario-selection.yaml"),
      "scenario-selection",
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(policyContentHash(first.value)).toBe(
      policyContentHash(second.value),
    );
    expect(policyContentHash(first.value)).toBe(
      first.value.policyContentSha256,
    );
  });

  it("resolves rule paths relative to a base directory", () => {
    expect(resolveRulePath("/rules", "scenario-selection")).toBe(
      "/rules/scenario-selection.yaml",
    );
    expect(resolveRulePath("/base/dir", "tab-selection")).toBe(
      "/base/dir/tab-selection.yaml",
    );
  });
});

describe("effectivePolicyApproval", () => {
  it("returns failure when approval context is undefined", async () => {
    const ruleSet = await loadRuleSet(
      resolve(rulesDir, "tab-selection.yaml"),
      "tab-selection",
    );
    expect(ruleSet.ok).toBe(true);
    if (!ruleSet.ok) return;
    const result = await effectivePolicyApproval(ruleSet.value, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("absent");
  });

  it("returns approved projection when valid approval chain is bound", async () => {
    const catalog = await evidenceCatalog();
    const ruleSet = await loadRuleSet(
      resolve(rulesDir, "tab-selection.yaml"),
      "tab-selection",
    );
    expect(ruleSet.ok).toBe(true);
    if (!ruleSet.ok) return;
    const artifact = catalog.caseEvidence[0];
    if (artifact === undefined) throw new Error("Missing catalog artifact.");
    const decisionWithoutHash = {
      decisionId: "00000000-0000-4000-8000-000000000501" as Uuid,
      appendOrdinal: 1,
      priorDecisionId: null,
      priorDecisionContentSha256: null,
      decisionType: "approve" as const,
      resultingStatus: "approved" as const,
      policyKind: "tab-selection" as const,
      policyVersion: ruleSet.value.version,
      policyContentSha256: ruleSet.value.policyContentSha256,
      sourceFileSha256: ruleSet.value.sourceFileSha256,
      evidenceCatalogId: catalog.catalogId,
      evidenceCatalogContentSha256: catalog.catalogContentSha256,
      evidenceCitations: [
        {
          sourceArtifactSha256: artifact.sha256,
          sourceLocator: "synthetic/tab-selection",
          effectiveDate: "2020-01-01",
          adoptionDate: null,
          supersedesArtifactSha256: null,
        },
      ],
      humanActor: {
        actorType: "human" as const,
        actorKey: "synthetic-reviewer",
        displayName: "Synthetic Reviewer",
        authorityContext: "unit-test",
      },
      rationale: "Approved for testing.",
      decidedAt: "2026-07-29T12:00:00.000Z" as never,
      schemaVersion: "1.0.0" as const,
    };
    const decision: ArchitecturePolicyApproval = {
      ...decisionWithoutHash,
      decisionContentSha256:
        await architecturePolicyDecisionContentHash(decisionWithoutHash),
    };
    const result = await effectivePolicyApproval(ruleSet.value, {
      evidenceCatalog: catalog,
      decisions: [decision],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("approved");
      expect(result.value.effectiveDecisionId).toBe(decision.decisionId);
    }
  });

  it("returns failure when approval chain is revoked", async () => {
    const catalog = await evidenceCatalog();
    const ruleSet = await loadRuleSet(
      resolve(rulesDir, "tab-selection.yaml"),
      "tab-selection",
    );
    expect(ruleSet.ok).toBe(true);
    if (!ruleSet.ok) return;
    const artifact = catalog.caseEvidence[0];
    if (artifact === undefined) throw new Error("Missing catalog artifact.");
    const approveContent = {
      decisionId: "00000000-0000-4000-8000-000000000510" as Uuid,
      appendOrdinal: 1,
      priorDecisionId: null,
      priorDecisionContentSha256: null,
      decisionType: "approve" as const,
      resultingStatus: "approved" as const,
      policyKind: "tab-selection" as const,
      policyVersion: ruleSet.value.version,
      policyContentSha256: ruleSet.value.policyContentSha256,
      sourceFileSha256: ruleSet.value.sourceFileSha256,
      evidenceCatalogId: catalog.catalogId,
      evidenceCatalogContentSha256: catalog.catalogContentSha256,
      evidenceCitations: [
        {
          sourceArtifactSha256: artifact.sha256,
          sourceLocator: "synthetic/tab-approval",
          effectiveDate: "2020-01-01",
          adoptionDate: null,
          supersedesArtifactSha256: null,
        },
      ],
      humanActor: {
        actorType: "human" as const,
        actorKey: "synthetic-reviewer",
        displayName: "Synthetic Reviewer",
        authorityContext: "unit-test",
      },
      rationale: "Initial approval.",
      decidedAt: "2026-07-29T12:00:00.000Z" as never,
      schemaVersion: "1.0.0" as const,
    };
    const approval: ArchitecturePolicyApproval = {
      ...approveContent,
      decisionContentSha256:
        await architecturePolicyDecisionContentHash(approveContent),
    };
    const revokeContent = {
      decisionId: "00000000-0000-4000-8000-000000000511" as Uuid,
      appendOrdinal: 2,
      priorDecisionId: approval.decisionId,
      priorDecisionContentSha256: approval.decisionContentSha256,
      decisionType: "revoke" as const,
      resultingStatus: "revoked" as const,
      policyKind: "tab-selection" as const,
      policyVersion: ruleSet.value.version,
      policyContentSha256: ruleSet.value.policyContentSha256,
      sourceFileSha256: ruleSet.value.sourceFileSha256,
      evidenceCatalogId: catalog.catalogId,
      evidenceCatalogContentSha256: catalog.catalogContentSha256,
      evidenceCitations: [
        {
          sourceArtifactSha256: artifact.sha256,
          sourceLocator: "synthetic/tab-revocation",
          effectiveDate: "2020-01-01",
          adoptionDate: null,
          supersedesArtifactSha256: null,
        },
      ],
      humanActor: {
        actorType: "human" as const,
        actorKey: "synthetic-reviewer",
        displayName: "Synthetic Reviewer",
        authorityContext: "unit-test",
      },
      rationale: "Revoked for testing.",
      decidedAt: "2026-07-29T13:00:00.000Z" as never,
      schemaVersion: "1.0.0" as const,
    };
    const revocation: ArchitecturePolicyApproval = {
      ...revokeContent,
      decisionContentSha256:
        await architecturePolicyDecisionContentHash(revokeContent),
    };
    const result = await effectivePolicyApproval(ruleSet.value, {
      evidenceCatalog: catalog,
      decisions: [approval, revocation],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("non-revoked");
  });

  it("returns failure when policy kind does not match any decision", async () => {
    const catalog = await evidenceCatalog();
    const ruleSet = await loadRuleSet(
      resolve(rulesDir, "scenario-selection.yaml"),
      "scenario-selection",
    );
    expect(ruleSet.ok).toBe(true);
    if (!ruleSet.ok) return;
    const artifact = catalog.caseEvidence[0];
    if (artifact === undefined) throw new Error("Missing catalog artifact.");
    const approveContent = {
      decisionId: "00000000-0000-4000-8000-000000000520" as Uuid,
      appendOrdinal: 1,
      priorDecisionId: null,
      priorDecisionContentSha256: null,
      decisionType: "approve" as const,
      resultingStatus: "approved" as const,
      policyKind: "tab-selection" as const,
      policyVersion: "1.0.0",
      policyContentSha256: "a".repeat(64) as Sha256,
      sourceFileSha256: "b".repeat(64) as Sha256,
      evidenceCatalogId: catalog.catalogId,
      evidenceCatalogContentSha256: catalog.catalogContentSha256,
      evidenceCitations: [
        {
          sourceArtifactSha256: artifact.sha256,
          sourceLocator: "synthetic/wrong-kind",
          effectiveDate: "2020-01-01",
          adoptionDate: null,
          supersedesArtifactSha256: null,
        },
      ],
      humanActor: {
        actorType: "human" as const,
        actorKey: "synthetic-reviewer",
        displayName: "Synthetic Reviewer",
        authorityContext: "unit-test",
      },
      rationale: "Wrong kind.",
      decidedAt: "2026-07-29T12:00:00.000Z" as never,
      schemaVersion: "1.0.0" as const,
    };
    const decision: ArchitecturePolicyApproval = {
      ...approveContent,
      decisionContentSha256:
        await architecturePolicyDecisionContentHash(approveContent),
    };
    const result = await effectivePolicyApproval(ruleSet.value, {
      evidenceCatalog: catalog,
      decisions: [decision],
    });
    expect(result.ok).toBe(false);
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EvidenceWorkspace } from "../../src/adapters/filesystem/evidence-workspace";
import { buildEvidenceCatalog } from "../../src/domain/evidence/catalog";
import { extractProvisionCandidate } from "../../src/domain/plan-rules/candidate-extraction";
import { authorRule } from "../../src/domain/plan-rules/rule-authoring";
import {
  createUnresolvedItem,
  resolveItem,
} from "../../src/domain/plan-rules/unresolved-items";
import { parseSha256, parseUuid } from "../../src/domain/shared/types";

describe("Feature 001 evidence ingestion foundation", () => {
  it("builds, stores, validates, and replays a synthetic catalog", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "pbgc-evidence-integration-"),
    );
    try {
      const caseId = "00000000-0000-4000-8000-000000000001";
      const built = await buildEvidenceCatalog({
        catalogId: "00000000-0000-4000-8000-000000000002",
        caseId,
        builtAt: "2026-07-28T12:00:00.000Z",
        caseEvidence: [
          {
            artifactId: "00000000-0000-4000-8000-000000000003",
            sha256: "a".repeat(64),
            sizeBytes: 18,
            locator: "synthetic/plan.txt",
            mediaType: "text/plain",
            receiptId: "00000000-0000-4000-8000-000000000004",
            receiptIds: ["00000000-0000-4000-8000-000000000004"],
            exactDuplicateOfSha256: null,
            containedBySha256: null,
            sourceRole: "executed-plan-document",
            reviewStatus: "released",
            importedAt: "2026-07-28T11:00:00.000Z",
          },
        ],
        referenceOnly: [],
        excludedQuarantined: [],
      });
      if (!built.ok) throw new Error(built.error.message);

      const opened = await EvidenceWorkspace.open(workspaceRoot, caseId);
      if (!opened.ok) throw new Error(opened.error);
      expect((await opened.value.writeCatalog(built.value)).ok).toBe(true);
      const replay = await opened.value.readCatalog();
      expect(replay.ok).toBe(true);
      if (replay.ok) {
        expect(replay.value.catalogContentSha256).toBe(
          built.value.catalogContentSha256,
        );
        expect(replay.value.caseEvidence).toEqual(built.value.caseEvidence);
      }
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("replays synthetic candidates, human resolutions, and governed rules through JSONL", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "pbgc-rule-integration-"),
    );
    try {
      const caseId = "00000000-0000-4000-8000-000000000020";
      const hash = parseSha256("c".repeat(64));
      if (!hash.ok) throw new Error(hash.error.message);
      const candidate = await extractProvisionCandidate({
        artifactSha256: hash.value,
        artifactLocator: "synthetic/amendment.txt",
        provisionIdentifier: "5.2",
        verbatimText: "Effective January 1, 2022, benefit formula A applies.",
        normalizedRestatement: "Benefit formula A applies.",
        extractedEffectiveDate: "2022-01-01",
        extractedAdoptionDate: null,
        dateExtractionConvention: "explicit",
        confidence: 0.9,
        classifierId: "synthetic-integration",
        classifierVersion: "1.0.0",
        ruleSetVersion: "feature-001-plan-rule-v1",
      });
      if (!candidate.ok) throw new Error(candidate.error);
      const human = {
        actorType: "human" as const,
        actorKey: "synthetic-reviewer",
        displayName: "Synthetic Reviewer",
        authorityContext: "integration-test",
      };
      const citation = {
        artifactSha256: hash.value,
        artifactLocator: "synthetic/amendment.txt",
        sourceRole: "amendment" as const,
        provisionIdentifier: "5.2",
        citationLocator: "line:1",
      };
      const interpretationA = parseUuid("00000000-0000-4000-8000-000000000021");
      const interpretationB = parseUuid("00000000-0000-4000-8000-000000000022");
      if (!interpretationA.ok || !interpretationB.ok)
        throw new Error("Invalid synthetic UUID.");
      const identities = [
        "00000000-0000-4000-8000-000000000023",
        "00000000-0000-4000-8000-000000000024",
      ];
      const dependencies = {
        uuid: () =>
          identities.shift() ?? "00000000-0000-4000-8000-000000000029",
        now: () => "2026-07-28T12:00:00.000Z",
      };
      const unresolved = await createUnresolvedItem(
        {
          kind: "ambiguous-text",
          affectedScope: "benefit/formula",
          competingInterpretations: [
            {
              interpretationId: interpretationA.value,
              statement: "Formula A applies.",
              evidence: [citation],
              sourceCandidateId: candidate.value.candidateId,
            },
            {
              interpretationId: interpretationB.value,
              statement: "Prior formula applies.",
              evidence: [citation],
              sourceCandidateId: candidate.value.candidateId,
            },
          ],
          consequence: "Accrued benefits differ.",
          reviewer: human,
        },
        dependencies,
      );
      if (!unresolved.ok) throw new Error(unresolved.error);
      const resolution = await resolveItem(
        unresolved.value,
        "accept",
        interpretationA.value,
        "Synthetic evidence review selected formula A.",
        human,
        dependencies,
      );
      if (!resolution.ok) throw new Error(resolution.error);
      const catalogInput = {
        catalogId: "00000000-0000-4000-8000-000000000026",
        caseId,
        builtAt: "2026-07-28T13:00:00.000Z",
        caseEvidence: [
          {
            artifactId: "00000000-0000-4000-8000-000000000027",
            sha256: hash.value,
            sizeBytes: 64,
            locator: "synthetic/amendment.txt",
            mediaType: "text/plain",
            receiptId: "00000000-0000-4000-8000-000000000028",
            receiptIds: ["00000000-0000-4000-8000-000000000028"],
            exactDuplicateOfSha256: null,
            containedBySha256: null,
            sourceRole: "amendment",
            reviewStatus: "released" as const,
            importedAt: "2026-07-28T11:00:00.000Z",
          },
        ],
        referenceOnly: [],
        excludedQuarantined: [],
      } as const;
      const catalog = await buildEvidenceCatalog(catalogInput);
      if (!catalog.ok) throw new Error("Synthetic catalog build failed.");
      const authored = await authorRule(
        {
          proposedCandidates: [candidate.value],
          primaryCitation: citation,
          catalog: catalog.value,
          unresolvedRecords: [unresolved.value, resolution.value.item],
          authorityOverrides: [],
          governingRestatement: "Benefit formula A applies.",
          effectiveDate: "2022-01-01",
          endDate: null,
          applicabilityConditions: [
            {
              dimension: "amendment-period",
              value: "on-or-after-2022-01-01",
              evidence: [citation],
            },
          ],
          requiredApplicabilityDimensions: ["amendment-period"],
          affectedScope: "benefit/formula",
          reviewer: human,
          approvalRationale: "Synthetic integration approval.",
          confidence: 0.95,
          ruleSetVersion: "feature-001-plan-rule-v1",
        },
        {
          uuid: () => "00000000-0000-4000-8000-000000000025",
          now: () => "2026-07-28T13:00:00.000Z",
        },
      );
      if (!authored.ok) throw new Error(authored.error.message);
      const opened = await EvidenceWorkspace.open(workspaceRoot, caseId);
      if (!opened.ok) throw new Error(opened.error);
      const deterministicReplay = await buildEvidenceCatalog({
        ...catalogInput,
        builtAt: "2026-07-28T14:00:00.000Z",
      });
      if (!deterministicReplay.ok) {
        throw new Error("Synthetic catalog build failed.");
      }
      expect(catalog.value.catalogContentSha256).toBe(
        deterministicReplay.value.catalogContentSha256,
      );
      expect((await opened.value.writeCatalog(catalog.value)).ok).toBe(true);
      expect((await opened.value.appendCandidates([candidate.value])).ok).toBe(
        true,
      );
      expect(
        (
          await opened.value.appendUnresolved([
            unresolved.value,
            resolution.value.item,
          ])
        ).ok,
      ).toBe(true);
      expect((await opened.value.appendRules([authored.value])).ok).toBe(true);
      expect((await opened.value.readCatalog()).ok).toBe(true);
      expect((await opened.value.readCandidates()).ok).toBe(true);
      expect((await opened.value.readUnresolved()).ok).toBe(true);
      expect((await opened.value.readRules()).ok).toBe(true);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

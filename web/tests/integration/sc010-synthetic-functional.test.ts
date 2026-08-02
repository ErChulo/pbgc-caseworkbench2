/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-empty-function */
import { describe, expect, it } from "vitest";

import { createCase, caseIndexEntry } from "../../src/domain/case/case";
import { CaseRegistry } from "../../src/domain/case/case-registry";
import {
  runScreenedArtifactPipeline,
  runArtifactPipeline,
} from "../../src/domain/attempts/intake-pipeline";
import type { ArtifactRecord } from "../../src/domain/artifacts/models";
import type { ScreeningFinding } from "../../src/domain/quarantine/models";
import { parseSha256, parseUuid } from "../../src/domain/shared/types";
import type { Sha256, Uuid, UtcTimestamp } from "../../src/domain/shared/types";

const uuid = (v: string): Uuid => {
  const r = parseUuid(v);
  if (!r.ok) throw new Error(`bad uuid: ${v}`);
  return r.value;
};
const sha = (hex: string): Sha256 => {
  const r = parseSha256(hex);
  if (!r.ok) throw new Error(`bad sha256: ${hex}`);
  return r.value;
};
const ts = (iso: string): UtcTimestamp => iso as UtcTimestamp;

const FIXED_CLOCK = { now: () => ts("2026-08-02T10:00:00Z") };
const FIXED_UUID = {
  generate: () => uuid("11111111-1111-4111-8111-111111111111"),
};
const ACTOR = {
  actorType: "human" as const,
  actorKey: "test-caseworker",
  displayName: "Test Caseworker",
  authorityContext: "case-intake",
};

function makeArtifact(
  id: string,
  sha256Hex: string,
  role: ArtifactRecord["artifactRole"] = "submitted-file",
  mediaType: string | null = null,
): ArtifactRecord {
  return {
    artifactId: uuid(id),
    receiptId: uuid("22222222-2222-4222-8222-222222222222"),
    sha256: sha(sha256Hex),
    attemptId: uuid("33333333-3333-4333-8333-333333333333"),
    caseId: uuid("44444444-4444-4444-8444-444444444444"),
    artifactRole: role,
    signatureMediaType: mediaType,
    processingStatus: "preserved",
    downstreamEligibility: "blocked",
    statusHistory: [],
  };
}

function blockingFinding(
  id: string,
  sha256Hex: string,
  category: ScreeningFinding["category"],
  ruleId: string,
): ScreeningFinding {
  return {
    findingId: id,
    artifactSha256: sha(sha256Hex),
    ruleId,
    ruleVersion: "v1",
    category,
    outcome: "blocked",
    severity: "critical",
    evidence: [`${category} detected`],
    limitations: [],
    blocksDownstream: true,
  };
}

function cleanScreen(sha256Hex: string) {
  return {
    artifactSha256: sha(sha256Hex),
    findings: [] as ScreeningFinding[],
    provisionalState: "screening-pending" as const,
    downstreamBlocked: true as const,
    ruleSetVersion: "v1",
  };
}

describe("SC-010 synthetic functional: Task 1 — create a synthetic case", () => {
  it("creates a production case with authoritative identifier and correct purpose", () => {
    const result = createCase(
      {
        authoritativeCaseId: "PBGC-2026-001234",
        purpose: "production",
        designationRationale: null,
        createdBy: ACTOR,
      },
      { uuid: FIXED_UUID, clock: FIXED_CLOCK },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.value;
    expect(c.authoritativeCaseId).toBe("PBGC-2026-001234");
    expect(c.purpose).toBe("production");
    expect(c.status).toBe("active");
    expect(c.createdBy.authorityContext).toBe("case-intake");
    expect(c.collisionDecisionId).toBeNull();
  });

  it("rejects production case without authoritative identifier", () => {
    const result = createCase(
      {
        authoritativeCaseId: null,
        purpose: "production",
        designationRationale: null,
        createdBy: ACTOR,
      },
      { uuid: FIXED_UUID, clock: FIXED_CLOCK },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PRODUCTION_CASE_IDENTIFIER_REQUIRED");
  });

  it("creates a non-production case with rationale", () => {
    const result = createCase(
      {
        authoritativeCaseId: "PBGC-2026-001234",
        purpose: "test",
        designationRationale: "Usability study synthetic case",
        createdBy: ACTOR,
      },
      { uuid: FIXED_UUID, clock: FIXED_CLOCK },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.purpose).toBe("test");
    expect(result.value.designationRationale).toBe(
      "Usability study synthetic case",
    );
  });

  it("case index entry projects correctly", () => {
    const result = createCase(
      {
        authoritativeCaseId: "PBGC-2026-001234",
        purpose: "production",
        designationRationale: null,
        createdBy: ACTOR,
      },
      { uuid: FIXED_UUID, clock: FIXED_CLOCK },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = caseIndexEntry(result.value);
    expect(entry.caseId).toBe(result.value.caseId);
    expect(entry.casePath).toContain("cases/");
    expect(entry.casePath).toContain("case.json");
    expect(entry.status).toBe("active");
  });

  it("registry detects production case collision", () => {
    const registry = new CaseRegistry(
      { uuid: FIXED_UUID, clock: FIXED_CLOCK },
      [],
    );
    const first = registry.create({
      authoritativeCaseId: "PBGC-2026-001234",
      purpose: "production",
      designationRationale: null,
      createdBy: ACTOR,
    });
    expect(first.kind).toBe("created");

    const second = registry.create({
      authoritativeCaseId: "PBGC-2026-001234",
      purpose: "production",
      designationRationale: null,
      createdBy: ACTOR,
    });
    expect(second.kind).toBe("collision");
    if (second.kind !== "collision") return;
    expect(second.authoritativeCaseId).toBe("PBGC-2026-001234");
    expect(second.existingCase.caseId).toBe(
      (first.kind === "created" ? first.caseRecord : null)?.caseId,
    );
  });

  it("registry resolves collision by resuming existing case", () => {
    const registry = new CaseRegistry(
      { uuid: FIXED_UUID, clock: FIXED_CLOCK },
      [],
    );
    const first = registry.create({
      authoritativeCaseId: "PBGC-2026-001234",
      purpose: "production",
      designationRationale: null,
      createdBy: ACTOR,
    });
    expect(first.kind).toBe("created");
    if (first.kind !== "created") return;

    const second = registry.create({
      authoritativeCaseId: "PBGC-2026-001234",
      purpose: "production",
      designationRationale: null,
      createdBy: ACTOR,
    });
    expect(second.kind).toBe("collision");
    if (second.kind !== "collision") return;

    const resolution = registry.resolveCollision(second, {
      action: "resume-existing",
      actor: ACTOR,
      rationale: "Resuming existing intake for same case",
      nonProductionPurpose: null,
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.value.kind).toBe("resumed-existing");
    if (resolution.value.kind !== "resumed-existing") return;
    expect(resolution.value.linkedCaseId).toBe(first.caseRecord.caseId);
    expect(resolution.value.decision.action).toBe("resume-existing");
    expect(resolution.value.decision.existingCaseId).toBe(
      first.caseRecord.caseId,
    );
  });

  it("registry creates non-production case after collision", () => {
    const registry = new CaseRegistry(
      { uuid: FIXED_UUID, clock: FIXED_CLOCK },
      [],
    );
    registry.create({
      authoritativeCaseId: "PBGC-2026-001234",
      purpose: "production",
      designationRationale: null,
      createdBy: ACTOR,
    });

    const second = registry.create({
      authoritativeCaseId: "PBGC-2026-001234",
      purpose: "production",
      designationRationale: null,
      createdBy: ACTOR,
    });
    expect(second.kind).toBe("collision");
    if (second.kind !== "collision") return;

    const resolution = registry.resolveCollision(second, {
      action: "create-non-production",
      actor: ACTOR,
      rationale: "Creating test case for usability study",
      nonProductionPurpose: "test",
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.value.kind).toBe("created-non-production");
    if (resolution.value.kind !== "created-non-production") return;
    expect(resolution.value.caseRecord.purpose).toBe("test");
    expect(resolution.value.caseRecord.authoritativeCaseId).toBe(
      "PBGC-2026-001234",
    );
    expect(resolution.value.decision.nonProductionPurpose).toBe("test");
  });
});

describe("SC-010 synthetic functional: Task 2 — submit a mixed synthetic package", () => {
  it("processes a mixed package with all artifact types through screened pipeline", async () => {
    const executable = makeArtifact(
      "aaaa1111-1111-4111-8111-111111111111",
      "a".repeat(64),
      "submitted-file",
      "application/x-msdownload",
    );
    const textFile = makeArtifact(
      "aaaa2222-2222-4222-8222-222222222222",
      "b".repeat(64),
      "submitted-file",
      "text/plain",
    );
    const csvFile = makeArtifact(
      "aaaa3333-3333-4333-8333-333333333333",
      "c".repeat(64),
      "submitted-file",
      "text/csv",
    );
    const archiveContainer = makeArtifact(
      "aaaa4444-4444-4444-8444-444444444444",
      "d".repeat(64),
      "submitted-container",
      "application/zip",
    );
    const extractedMember = makeArtifact(
      "aaaa5555-5555-4555-8555-555555555555",
      "e".repeat(64),
      "extracted-member",
      "text/plain",
    );
    const xlsxFile = makeArtifact(
      "aaaa6666-6666-4666-8666-666666666666",
      "f".repeat(64),
      "submitted-file",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const artifacts = [
      executable,
      textFile,
      csvFile,
      archiveContainer,
      extractedMember,
      xlsxFile,
    ];

    const screened = await runScreenedArtifactPipeline(
      artifacts,
      (item) => {
        if (
          item.artifactId === executable.artifactId ||
          item.artifactId === archiveContainer.artifactId
        ) {
          return Promise.resolve({
            artifactSha256: item.sha256,
            findings: [
              blockingFinding(
                `find-${item.artifactId}`,
                item.sha256,
                item.artifactId === executable.artifactId
                  ? "executable"
                  : "archive-risk",
                item.artifactId === executable.artifactId
                  ? "exec-check"
                  : "archive-check",
              ),
            ],
            provisionalState: "provisional-safety-block" as const,
            downstreamBlocked: true as const,
            ruleSetVersion: "v1",
          });
        }
        return Promise.resolve(cleanScreen(item.sha256));
      },
      async () => {
        void 0;
      },
    );

    expect(screened).toHaveLength(6);
    const blocked = screened.filter(
      (o) => o.screening.provisionalState === "provisional-safety-block",
    );
    const pending = screened.filter(
      (o) => o.screening.provisionalState === "screening-pending",
    );
    expect(blocked).toHaveLength(2);
    expect(pending).toHaveLength(4);
    for (const o of blocked) {
      expect(o.downstreamBlocked).toBe(true);
    }
    for (const o of pending) {
      expect(o.passiveExtractionAttempted).toBe(true);
    }
  });

  it("processes mixed package through generic artifact pipeline with events", async () => {
    const artifacts = [
      makeArtifact("bbbb1111-1111-4111-8111-111111111111", "a".repeat(64)),
      makeArtifact("bbbb2222-2222-4222-8222-222222222222", "b".repeat(64)),
      makeArtifact("bbbb3333-3333-4333-8333-333333333333", "c".repeat(64)),
    ];

    const result = await runArtifactPipeline(artifacts, (item) => {
      return Promise.resolve([
        {
          artifactId: item.artifactId,
          stage: "preserved" as const,
          message: "Synthetically preserved.",
        },
        {
          artifactId: item.artifactId,
          stage: "screened" as const,
          message: "Synthetically screened.",
        },
      ]);
    });

    expect(result.status).toBe("completed");
    expect(result.events).toHaveLength(6);
    expect(result.downstreamBlocked).toBe(true);
    expect(result.governedState).toBe("provisional");
  });
});

describe("SC-010 synthetic functional: Task 3 — identify quarantined artifacts", () => {
  it("identifies quarantined artifacts by screening category from mixed package", async () => {
    const executable = makeArtifact(
      "cccc1111-1111-4111-8111-111111111111",
      "a".repeat(64),
      "submitted-file",
      "application/x-msdownload",
    );
    const macroEnabled = makeArtifact(
      "cccc2222-2222-4222-8222-222222222222",
      "b".repeat(64),
      "submitted-file",
      "application/vnd.ms-excel.sheet.macroEnabled.12",
    );
    const archiveWithRisk = makeArtifact(
      "cccc3333-3333-4333-8333-333333333333",
      "c".repeat(64),
      "submitted-container",
      "application/zip",
    );
    const cleanText = makeArtifact(
      "cccc4444-4444-4444-8444-444444444444",
      "d".repeat(64),
      "submitted-file",
      "text/plain",
    );
    const cleanCsv = makeArtifact(
      "cccc5555-5555-4555-8555-555555555555",
      "e".repeat(64),
      "submitted-file",
      "text/csv",
    );

    const artifacts = [
      executable,
      macroEnabled,
      archiveWithRisk,
      cleanText,
      cleanCsv,
    ];

    const screenFn = async (item: ArtifactRecord) => {
      if (item.artifactId === executable.artifactId) {
        return {
          artifactSha256: item.sha256,
          findings: [
            blockingFinding(
              "exec-find",
              item.sha256,
              "executable",
              "exec-magic",
            ),
          ],
          provisionalState: "provisional-safety-block" as const,
          downstreamBlocked: true as const,
          ruleSetVersion: "v1",
        };
      }
      if (item.artifactId === macroEnabled.artifactId) {
        return {
          artifactSha256: item.sha256,
          findings: [
            blockingFinding("macro-find", item.sha256, "macro", "macro-check"),
          ],
          provisionalState: "provisional-safety-block" as const,
          downstreamBlocked: true as const,
          ruleSetVersion: "v1",
        };
      }
      if (item.artifactId === archiveWithRisk.artifactId) {
        return {
          artifactSha256: item.sha256,
          findings: [
            blockingFinding(
              "archive-find",
              item.sha256,
              "archive-risk",
              "archive-path-check",
            ),
          ],
          provisionalState: "provisional-safety-block" as const,
          downstreamBlocked: true as const,
          ruleSetVersion: "v1",
        };
      }
      return cleanScreen(item.sha256);
    };

    const inspected: string[] = [];
    const outcomes = await runScreenedArtifactPipeline(
      artifacts,
      screenFn,
      (item) => {
        inspected.push(item.artifactId);
        return Promise.resolve();
      },
    );

    const quarantined = outcomes.filter(
      (o) => o.screening.provisionalState === "provisional-safety-block",
    );
    const clean = outcomes.filter(
      (o) => o.screening.provisionalState === "screening-pending",
    );

    expect(quarantined).toHaveLength(3);
    expect(clean).toHaveLength(2);

    const categories = quarantined.flatMap((o) =>
      o.screening.findings.map((f) => f.category),
    );
    expect(categories).toContain("executable");
    expect(categories).toContain("macro");
    expect(categories).toContain("archive-risk");

    expect(inspected).toHaveLength(2);
    expect(clean.every((o) => o.passiveExtractionAttempted)).toBe(true);
    expect(quarantined.every((o) => o.passiveExtractionAttempted)).toBe(false);
  });

  it("enumerates quarantine findings per artifact with correct severity", async () => {
    const blocked = makeArtifact(
      "dddd1111-1111-4111-8111-111111111111",
      "a".repeat(64),
    );
    const clean = makeArtifact(
      "dddd2222-2222-4222-8222-222222222222",
      "b".repeat(64),
    );

    const outcomes = await runScreenedArtifactPipeline(
      [blocked, clean],
      (item) => {
        if (item.artifactId === blocked.artifactId) {
          return Promise.resolve({
            artifactSha256: item.sha256,
            findings: [
              blockingFinding("f1", item.sha256, "executable", "exec-rule"),
              blockingFinding("f2", item.sha256, "secret", "secret-rule"),
            ],
            provisionalState: "provisional-safety-block" as const,
            downstreamBlocked: true as const,
            ruleSetVersion: "v1",
          });
        }
        return Promise.resolve(cleanScreen(item.sha256));
      },
      async () => {},
    );

    const blockedOutcome = outcomes.find(
      (o) => o.artifact.artifactId === blocked.artifactId,
    );
    expect(blockedOutcome).toBeDefined();
    expect(blockedOutcome?.screening.findings).toHaveLength(2);
    expect(
      blockedOutcome?.screening.findings.every(
        (f) => f.severity === "critical",
      ),
    ).toBe(true);
    expect(
      blockedOutcome?.screening.findings.every((f) => f.blocksDownstream),
    ).toBe(true);

    const cleanOutcome = outcomes.find(
      (o) => o.artifact.artifactId === clean.artifactId,
    );
    expect(cleanOutcome?.screening.findings).toHaveLength(0);
  });

  it("handles archive member quarantined separately from parent container", async () => {
    const container = makeArtifact(
      "eeee1111-1111-4111-8111-111111111111",
      "a".repeat(64),
      "submitted-container",
      "application/zip",
    );
    const member = makeArtifact(
      "eeee2222-2222-4222-8222-222222222222",
      "b".repeat(64),
      "extracted-member",
      "text/plain",
    );

    const outcomes = await runScreenedArtifactPipeline(
      [container, member],
      (item) => {
        if (item.artifactId === container.artifactId) {
          return Promise.resolve({
            artifactSha256: item.sha256,
            findings: [
              blockingFinding(
                "archive-f",
                item.sha256,
                "archive-risk",
                "traversal-check",
              ),
            ],
            provisionalState: "provisional-safety-block" as const,
            downstreamBlocked: true as const,
            ruleSetVersion: "v1",
          });
        }
        if (item.artifactId === member.artifactId) {
          return Promise.resolve({
            artifactSha256: item.sha256,
            findings: [
              blockingFinding(
                "member-f",
                item.sha256,
                "executable",
                "exec-check",
              ),
            ],
            provisionalState: "provisional-safety-block" as const,
            downstreamBlocked: true as const,
            ruleSetVersion: "v1",
          });
        }
        return Promise.resolve(cleanScreen(item.sha256));
      },
      async () => {},
    );

    expect(outcomes).toHaveLength(2);
    const containerOutcome = outcomes.find(
      (o) => o.artifact.artifactId === container.artifactId,
    );
    const memberOutcome = outcomes.find(
      (o) => o.artifact.artifactId === member.artifactId,
    );
    expect(containerOutcome?.screening.findings[0]?.category).toBe(
      "archive-risk",
    );
    expect(memberOutcome?.screening.findings[0]?.category).toBe("executable");
    expect(containerOutcome?.screening.artifactSha256).not.toBe(
      memberOutcome?.screening.artifactSha256,
    );
  });
});

describe("SC-010 synthetic functional: Task 4 — locate unresolved items", () => {
  it("produces unresolved items of different kinds from a single intake", async () => {
    const artifacts = [
      makeArtifact("ffff1111-1111-4111-8111-111111111111", "a".repeat(64)),
      makeArtifact("ffff2222-2222-4222-8222-222222222222", "b".repeat(64)),
      makeArtifact("ffff3333-3333-4333-8333-333333333333", "c".repeat(64)),
    ];

    const unresolvedKinds: string[] = [];

    const result = await runArtifactPipeline(artifacts, async (item) => {
      if (item.artifactId === artifacts[0]?.artifactId) {
        unresolvedKinds.push("ambiguous-date-source");
        return [
          {
            artifactId: item.artifactId,
            stage: "screened" as const,
            message: "Unresolved: ambiguous date source requires human review.",
          },
        ];
      }
      if (item.artifactId === artifacts[1]?.artifactId) {
        unresolvedKinds.push("missing-required-field");
        return [
          {
            artifactId: item.artifactId,
            stage: "screened" as const,
            message: "Unresolved: missing compensation field.",
          },
        ];
      }
      unresolvedKinds.push("hidden-content-flag");
      return [
        {
          artifactId: item.artifactId,
          stage: "screened" as const,
          message: "Unresolved: hidden content detected in workbook.",
        },
      ];
    });

    expect(result.status).toBe("completed");
    expect(unresolvedKinds).toHaveLength(3);
    expect(unresolvedKinds).toContain("ambiguous-date-source");
    expect(unresolvedKinds).toContain("missing-required-field");
    expect(unresolvedKinds).toContain("hidden-content-flag");
  });

  it("associates unresolved items with specific artifacts from mixed package", async () => {
    const textArtifact = makeArtifact(
      "aaaa0111-1111-4111-8111-111111111111",
      "a".repeat(64),
    );
    const csvArtifact = makeArtifact(
      "aaaa0222-2222-4222-8222-222222222222",
      "b".repeat(64),
    );

    const artifactUnresolvedMap = new Map<string, string[]>();

    await runArtifactPipeline([textArtifact, csvArtifact], async (item) => {
      const key = item.artifactId;
      if (key === textArtifact.artifactId) {
        artifactUnresolvedMap.set(key, [
          "conflicting-author-dates",
          "ambiguous-effective-period",
        ]);
      } else {
        artifactUnresolvedMap.set(key, ["missing-compensation-field"]);
      }
      return [
        {
          artifactId: item.artifactId,
          stage: "screened" as const,
          message: "Screened with unresolved items.",
        },
      ];
    });

    expect(artifactUnresolvedMap.size).toBe(2);
    expect(artifactUnresolvedMap.get(textArtifact.artifactId)).toHaveLength(2);
    expect(artifactUnresolvedMap.get(csvArtifact.artifactId)).toHaveLength(1);
    expect(artifactUnresolvedMap.get(textArtifact.artifactId)).toContain(
      "conflicting-author-dates",
    );
    expect(artifactUnresolvedMap.get(textArtifact.artifactId)).toContain(
      "ambiguous-effective-period",
    );
    expect(artifactUnresolvedMap.get(csvArtifact.artifactId)).toContain(
      "missing-compensation-field",
    );
  });

  it("generates unresolved items from both quarantined and non-quarantined artifacts", async () => {
    const quarantined = makeArtifact(
      "aaaa0333-3333-4333-8333-333333333333",
      "c".repeat(64),
    );
    const clean = makeArtifact(
      "aaaa0444-4444-4444-8444-444444444444",
      "d".repeat(64),
    );

    const allUnresolved: {
      artifactId: string;
      kind: string;
      source: string;
    }[] = [];

    const outcomes = await runScreenedArtifactPipeline(
      [quarantined, clean],
      (item) => {
        if (item.artifactId === quarantined.artifactId) {
          return Promise.resolve({
            artifactSha256: item.sha256,
            findings: [
              blockingFinding(
                "q-find",
                item.sha256,
                "unsupported",
                "format-check",
              ),
            ],
            provisionalState: "provisional-safety-block" as const,
            downstreamBlocked: true as const,
            ruleSetVersion: "v1",
          });
        }
        return Promise.resolve(cleanScreen(item.sha256));
      },
      async () => {},
    );

    for (const outcome of outcomes) {
      const aid = outcome.artifact.artifactId;
      if (aid === quarantined.artifactId) {
        allUnresolved.push({
          artifactId: aid,
          kind: "unsupported-format",
          source: "quarantine",
        });
      } else {
        allUnresolved.push({
          artifactId: aid,
          kind: "missing-effective-date",
          source: "normalization",
        });
      }
    }

    expect(allUnresolved).toHaveLength(2);
    const fromQuarantine = allUnresolved.filter(
      (u) => u.source === "quarantine",
    );
    const fromNormalization = allUnresolved.filter(
      (u) => u.source === "normalization",
    );
    expect(fromQuarantine).toHaveLength(1);
    expect(fromNormalization).toHaveLength(1);
    expect(fromQuarantine[0]?.kind).toBe("unsupported-format");
    expect(fromNormalization[0]?.kind).toBe("missing-effective-date");
  });

  it("full end-to-end: case creation, mixed package, quarantine identification, and unresolved items", async () => {
    const registry = new CaseRegistry(
      { uuid: FIXED_UUID, clock: FIXED_CLOCK },
      [],
    );
    const caseResult = registry.create({
      authoritativeCaseId: "PBGC-2026-SC010",
      purpose: "production",
      designationRationale: null,
      createdBy: ACTOR,
    });
    expect(caseResult.kind).toBe("created");

    const executable = makeArtifact(
      "eeee0111-1111-4111-8111-111111111111",
      "a".repeat(64),
      "submitted-file",
      "application/x-msdownload",
    );
    const planDoc = makeArtifact(
      "eeee0222-2222-4222-8222-222222222222",
      "b".repeat(64),
      "submitted-file",
      "text/plain",
    );
    const populationCsv = makeArtifact(
      "eeee0333-3333-4333-8333-333333333333",
      "c".repeat(64),
      "submitted-file",
      "text/csv",
    );
    const archive = makeArtifact(
      "eeee0444-4444-4444-8444-444444444444",
      "d".repeat(64),
      "submitted-container",
      "application/zip",
    );
    const workbook = makeArtifact(
      "eeee0555-5555-4555-8555-555555555555",
      "e".repeat(64),
      "submitted-file",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const allArtifacts = [
      executable,
      planDoc,
      populationCsv,
      archive,
      workbook,
    ];

    const screenFn = async (item: ArtifactRecord) => {
      if (item.artifactId === executable.artifactId) {
        return {
          artifactSha256: item.sha256,
          findings: [
            blockingFinding("e-f", item.sha256, "executable", "exec-rule"),
          ],
          provisionalState: "provisional-safety-block" as const,
          downstreamBlocked: true as const,
          ruleSetVersion: "v1",
        };
      }
      if (item.artifactId === archive.artifactId) {
        return {
          artifactSha256: item.sha256,
          findings: [
            blockingFinding("a-f", item.sha256, "archive-risk", "archive-rule"),
          ],
          provisionalState: "provisional-safety-block" as const,
          downstreamBlocked: true as const,
          ruleSetVersion: "v1",
        };
      }
      return cleanScreen(item.sha256);
    };

    const outcomes = await runScreenedArtifactPipeline(
      allArtifacts,
      screenFn,
      async () => {},
    );

    const quarantined = outcomes.filter(
      (o) => o.screening.provisionalState === "provisional-safety-block",
    );
    const clean = outcomes.filter(
      (o) => o.screening.provisionalState === "screening-pending",
    );

    expect(quarantined).toHaveLength(2);
    expect(clean).toHaveLength(3);

    const quarantineCategories = quarantined.flatMap((o) =>
      o.screening.findings.map((f) => f.category),
    );
    expect(quarantineCategories).toContain("executable");
    expect(quarantineCategories).toContain("archive-risk");

    const unresolvedFromQuarantined: string[] = [];
    const unresolvedFromClean: string[] = [];

    for (const outcome of outcomes) {
      const isQuarantined =
        outcome.screening.provisionalState === "provisional-safety-block";
      if (isQuarantined) {
        unresolvedFromQuarantined.push(
          `blocked-${outcome.artifact.artifactId}`,
        );
      } else {
        unresolvedFromClean.push(`unresolved-${outcome.artifact.artifactId}`);
      }
    }

    expect(unresolvedFromQuarantined).toHaveLength(2);
    expect(unresolvedFromClean).toHaveLength(3);

    expect(registry.cases()).toHaveLength(1);
    expect(registry.cases()[0]?.authoritativeCaseId).toBe("PBGC-2026-SC010");
  });
});

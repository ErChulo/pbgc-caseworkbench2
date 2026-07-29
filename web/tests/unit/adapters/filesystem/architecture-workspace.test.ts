import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArchitectureFilesystemWorkspace } from "../../../../src/adapters/filesystem/architecture-workspace";
import type { V1Architecture } from "../../../../src/domain/architecture/models";
import { architectureSchemaVersion } from "../../../../src/domain/architecture/models";
import {
  architectureToJsonValue,
  computeArchitectureContentSha256,
} from "../../../../src/domain/architecture/workspace-adapter";
import type {
  Sha256,
  Uuid,
  UtcTimestamp,
} from "../../../../src/domain/shared/types";

const caseId = "550e8400-e29b-41d4-a716-446655440000" as Uuid;
const architectureId = "6f9619ff-8b86-4a5d-a8ab-1f4c3b2a1900" as Uuid;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "architecture-workspace-"));
  roots.push(root);
  return root;
}

function architecture(): V1Architecture {
  const initial: V1Architecture = {
    architectureId,
    caseId,
    builtAt: "2026-07-29T12:00:00.000Z" as UtcTimestamp,
    schemaVersion: architectureSchemaVersion,
    ruleSetVersion: "1.0.0",
    lineage: {
      policies: [
        "scenario-selection",
        "tab-selection",
        "iob-classification",
        "field-name-glossary",
      ].map((policyKind, index) => ({
        policyKind: policyKind as "scenario-selection",
        policyVersion: "1.0.0",
        policyContentSha256: String(index + 1).repeat(64) as Sha256,
        sourceFileSha256: String(index + 5).repeat(64) as Sha256,
        approvalDecisionId:
          `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` as Uuid,
        approvalDecisionContentSha256: String(index + 5).repeat(64) as Sha256,
      })),
      evidenceCatalogId: "00000000-0000-4000-8000-000000000010" as Uuid,
      evidenceCatalogContentSha256: "a".repeat(64) as Sha256,
      population: [
        {
          candidateKey: "a".repeat(64) as Sha256,
          artifactSha256: "b".repeat(64) as Sha256,
          workbookProfileContentSha256: "e".repeat(64) as Sha256,
          approvalDecisionId: "population-approval",
          approvalDecisionContentSha256: "c".repeat(64) as Sha256,
        },
      ],
      caseControls: [
        {
          controlId: "00000000-0000-4000-8000-000000000011" as Uuid,
          contentSha256: "d".repeat(64) as Sha256,
        },
      ],
      authorityOverrides: [],
    },
    sourceTabs: [
      {
        tabName: "Synthetic Retirees",
        role: "population",
        workbookProfileContentSha256: "e".repeat(64) as Sha256,
        populationCandidateKey: "a".repeat(64) as Sha256,
        populationArtifactSha256: "b".repeat(64) as Sha256,
        fieldCount: 1,
        recordCount: 1,
      },
      {
        tabName: "Tables",
        role: "support",
        workbookProfileContentSha256: "e".repeat(64) as Sha256,
        populationCandidateKey: null,
        populationArtifactSha256: null,
        fieldCount: 1,
        recordCount: 0,
      },
    ],
    runs: [
      {
        runId: "NRD",
        runLabel: "Normal retirement date",
        effectiveDateRange: { startDate: "2026-01-01", endDate: null },
        justifications: [
          {
            source: "plan-rule",
            referenceId: "synthetic-rule",
            referenceContentSha256: "c".repeat(64) as Sha256,
          },
        ],
        applicableTabs: ["Synthetic Retirees"],
      },
    ],
    cells: new Map([
      [
        "Synthetic Retirees::A1",
        {
          key: "Synthetic Retirees::A1",
          sourceTab: "Synthetic Retirees",
          cellAddress: "A1",
          genericField: "DOB",
          description: "Synthetic date of birth field",
          hasFormula: false,
          formulaText: null,
          perRunClassification: new Map([
            [
              "NRD",
              {
                runId: "NRD",
                iob: "I",
                justification: "Synthetic fixture",
                ruleVersion: "1.0.0",
              },
            ],
          ]),
        },
      ],
      [
        "Tables::A1",
        {
          key: "Tables::A1",
          sourceTab: "Tables",
          cellAddress: "A1",
          genericField: "FREEZE_DATE",
          description: "Synthetic support value",
          hasFormula: false,
          formulaText: null,
          perRunClassification: new Map([
            [
              "NRD",
              {
                runId: "NRD",
                iob: "I",
                justification: "Synthetic fixture",
                ruleVersion: "1.0.0",
              },
            ],
          ]),
        },
      ],
    ]),
    formulaDependencies: [],
    namedRanges: [
      {
        name: "Freeze_Date",
        sourceTab: "Tables",
        cellAddress: "A1",
        scope: "workbook",
        genericField: "FREEZE_DATE",
      },
    ],
    architectureContentSha256: "0".repeat(64) as Sha256,
  };
  return {
    ...initial,
    architectureContentSha256: computeArchitectureContentSha256(initial),
  };
}

describe("ArchitectureFilesystemWorkspace", () => {
  it("saves immutably, reloads maps, and uses owner-only permissions", async () => {
    const root = await temporaryRoot();
    const opened = await ArchitectureFilesystemWorkspace.open(root, caseId);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const value = architecture();
    expect((await opened.value.saveArchitecture(value)).ok).toBe(true);
    expect((await opened.value.saveArchitecture(value)).ok).toBe(false);
    const loaded = await opened.value.loadArchitecture(architectureId);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.cells).toBeInstanceOf(Map);
      expect(loaded.value.sourceTabs).toContainEqual(
        expect.objectContaining({ tabName: "Tables", role: "support" }),
      );
      expect(loaded.value.namedRanges[0]?.sourceTab).toBe("Tables");
    }
    const directory = await lstat(opened.value.workspacePath);
    const file = await lstat(
      join(opened.value.workspacePath, `${architectureId}.json`),
    );
    expect(directory.mode & 0o777).toBe(0o700);
    expect(file.mode & 0o777).toBe(0o600);
  });

  it("rejects a mismatched content hash before writing", async () => {
    const root = await temporaryRoot();
    const opened = await ArchitectureFilesystemWorkspace.open(root, caseId);
    if (!opened.ok) throw new Error(opened.error.message);
    const value = {
      ...architecture(),
      architectureContentSha256: "f".repeat(64) as Sha256,
    };
    const saved = await opened.value.saveArchitecture(value);
    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a semantically malformed architecture even with a recomputed hash", async () => {
    const root = await temporaryRoot();
    const opened = await ArchitectureFilesystemWorkspace.open(root, caseId);
    if (!opened.ok) throw new Error(opened.error.message);
    const valid = architecture();
    const original = valid.cells.get("Synthetic Retirees::A1");
    if (original === undefined) throw new Error("Fixture cell is missing.");
    const malformed: V1Architecture = {
      ...valid,
      cells: new Map([
        [
          "Synthetic Retirees::A1",
          { ...original, hasFormula: true, formulaText: "" },
        ],
      ]),
    };
    const hashValidMalformed = {
      ...malformed,
      architectureContentSha256: computeArchitectureContentSha256(malformed),
    };
    const saved = await opened.value.saveArchitecture(hashValidMalformed);
    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects unsafe identifiers and symlinked architecture files", async () => {
    const root = await temporaryRoot();
    const opened = await ArchitectureFilesystemWorkspace.open(root, caseId);
    if (!opened.ok) throw new Error(opened.error.message);
    expect((await opened.value.loadArchitecture("../escape")).ok).toBe(false);
    const outside = join(root, "outside.json");
    await writeFile(outside, "{}\n", { mode: 0o600 });
    await symlink(
      outside,
      join(opened.value.workspacePath, `${architectureId}.json`),
    );
    const loaded = await opened.value.loadArchitecture(architectureId);
    expect(loaded.ok).toBe(false);
  });

  it("detects post-save schema/hash tampering", async () => {
    const root = await temporaryRoot();
    const opened = await ArchitectureFilesystemWorkspace.open(root, caseId);
    if (!opened.ok) throw new Error(opened.error.message);
    expect((await opened.value.saveArchitecture(architecture())).ok).toBe(true);
    const path = join(opened.value.workspacePath, `${architectureId}.json`);
    const text = await readFile(path, "utf8");
    await chmod(path, 0o600);
    await writeFile(
      path,
      text.replace(
        '"runLabel": "Normal retirement date"',
        '"runLabel": "Tampered"',
      ),
    );
    const loaded = await opened.value.loadArchitecture(architectureId);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.error.code).toBe("HASH_MISMATCH");
  });

  it("rejects a loaded semantic mutation with a recomputed content hash", async () => {
    const root = await temporaryRoot();
    const opened = await ArchitectureFilesystemWorkspace.open(root, caseId);
    if (!opened.ok) throw new Error(opened.error.message);
    const valid = architecture();
    const original = valid.cells.get("Synthetic Retirees::A1");
    if (original === undefined) throw new Error("Fixture cell is missing.");
    const malformed: V1Architecture = {
      ...valid,
      cells: new Map([
        [
          "Synthetic Retirees::A1",
          {
            ...original,
            genericField: "CALCULATION",
          },
        ],
      ]),
    };
    const hashValidMalformed = {
      ...malformed,
      architectureContentSha256: computeArchitectureContentSha256(malformed),
    };
    const path = join(opened.value.workspacePath, `${architectureId}.json`);
    await writeFile(
      path,
      `${JSON.stringify(architectureToJsonValue(hashValidMalformed), null, 2)}\n`,
      { mode: 0o600 },
    );
    const loaded = await opened.value.loadArchitecture(architectureId);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.error.code).toBe("VALIDATION_ERROR");
  });
});

import { describe, it, expect } from "vitest";
import {
  computeContentHash,
  exportBuildSpec,
  importBuildSpec,
} from "../../../../src/domain/build-spec/serialization";
import type { BuildSpec } from "../../../../src/domain/build-spec/models";
import type {
  Sha256,
  Uuid,
  UtcTimestamp,
} from "../../../../src/domain/shared/types";

function createMockBuildSpec(overrides?: Partial<BuildSpec>): BuildSpec {
  return {
    schemaVersion: "1.0.0",
    buildSpecId: "00000000-0000-1000-8000-000000000001" as Uuid,
    architectureId: "00000000-0000-1000-8000-000000000002" as Uuid,
    caseId: "00000000-0000-1000-8000-000000000003" as Uuid,
    ruleSetVersion: "1.0.0",
    generatedAt: "2026-07-28T12:00:00Z" as UtcTimestamp,
    formulas: [],
    namedRanges: [],
    cellMappings: [],
    executionOrder: {
      order: [],
      levelCount: 0,
      maxDepth: 0,
      hasCycles: false,
      cycleNodes: [],
    },
    validation: {
      isValid: true,
      errors: [],
      warnings: [],
      validatedAt: "2026-07-28T12:00:00Z" as UtcTimestamp,
    },
    buildSpecContentSha256: "a".repeat(64) as Sha256,
    ...overrides,
  };
}

describe("serialization", () => {
  it("computes deterministic content hash", async () => {
    const buildSpec = createMockBuildSpec();

    const hash1 = await computeContentHash(buildSpec);
    const hash2 = await computeContentHash(buildSpec);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("produces different hashes for different build specs", async () => {
    const spec1 = createMockBuildSpec({
      buildSpecId: "00000000-0000-1000-8000-000000000001" as Uuid,
    });
    const spec2 = createMockBuildSpec({
      buildSpecId: "00000000-0000-1000-8000-000000000002" as Uuid,
    });

    const hash1 = await computeContentHash(spec1);
    const hash2 = await computeContentHash(spec2);

    expect(hash1).not.toBe(hash2);
  });

  it("exports build spec with metadata", async () => {
    const buildSpec = createMockBuildSpec();

    const exported = await exportBuildSpec({ buildSpec });

    expect(exported.buildSpec).toBe(buildSpec);
    expect(exported.exportMetadata.schemaVersion).toBe("1.0.0");
    expect(exported.exportMetadata.toolVersion).toBe("1.0.0");
    expect(exported.contentSha256).toHaveLength(64);
  });

  it("imports build spec with hash verification", async () => {
    const initial = createMockBuildSpec();
    const buildSpec = createMockBuildSpec({
      buildSpecContentSha256: await computeContentHash(initial),
    });

    const exported = await exportBuildSpec({ buildSpec });
    const imported = await importBuildSpec(exported);

    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error("Expected a verified import.");
    expect(imported.value.buildSpec).toBe(exported.buildSpec);
    expect(imported.value.contentSha256).toBe(exported.contentSha256);
    expect(imported.value.importMetadata.verified).toBe(true);
  });

  it("rejects a mismatched embedded build spec hash", async () => {
    const initial = createMockBuildSpec();
    const buildSpec = createMockBuildSpec({
      buildSpecContentSha256: await computeContentHash(initial),
    });
    const exported = await exportBuildSpec({ buildSpec });
    const imported = await importBuildSpec({
      ...exported,
      buildSpec: {
        ...buildSpec,
        buildSpecContentSha256: "f".repeat(64) as Sha256,
      },
    });

    expect(imported).toMatchObject({
      ok: false,
      error: {
        code: "BUILD_SPEC_HASH_MISMATCH",
        expected: "f".repeat(64),
        actual: exported.contentSha256,
      },
    });
    expect(imported).not.toHaveProperty("value.buildSpec");
  });

  it("detects tampered build spec", async () => {
    const buildSpec = createMockBuildSpec();

    const exported = await exportBuildSpec({ buildSpec });

    const tampered = createMockBuildSpec({
      buildSpecId: "00000000-0000-1000-8000-000000000099" as Uuid,
    });

    const imported = await importBuildSpec({
      ...exported,
      buildSpec: tampered,
    });

    expect(imported).toMatchObject({
      ok: false,
      error: { code: "BUILD_SPEC_HASH_MISMATCH" },
    });
    expect(imported).not.toHaveProperty("value.buildSpec");
  });

  it("fails closed for schema-invalid input", async () => {
    const buildSpec = createMockBuildSpec();
    const exported = await exportBuildSpec({ buildSpec });
    const imported = await importBuildSpec({
      ...exported,
      buildSpec: { ...buildSpec, unboundContent: "not hash-bound" },
    });

    expect(imported).toMatchObject({
      ok: false,
      error: { code: "BUILD_SPEC_SCHEMA_INVALID" },
    });
    expect(imported).not.toHaveProperty("value.buildSpec");
  });

  it("produces canonical JSON", async () => {
    const buildSpec = createMockBuildSpec();

    const hash1 = await computeContentHash(buildSpec);
    const hash2 = await computeContentHash(buildSpec);

    expect(hash1).toBe(hash2);
  });
});

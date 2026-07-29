import { describe, expect, it } from "vitest";
import {
  computeContentHash,
  deterministicBuildSpecIdentityPayload,
  exportBuildSpec,
  importBuildSpec,
} from "../../../../src/domain/build-spec/serialization";
import { deterministicUuid } from "../../../../src/domain/build-spec/identity";
import type { UtcTimestamp } from "../../../../src/domain/shared/types";
import { buildSpecV2 } from "../../../fixtures/formula-compiler";

const exportedAt = "2026-07-29T12:00:00Z" as UtcTimestamp;
const importedAt = "2026-07-29T12:01:00Z" as UtcTimestamp;

describe("BuildSpec serialization", () => {
  it("hashes deterministic content independently of operational metadata", async () => {
    const buildSpec = await buildSpecV2();
    expect(await computeContentHash(buildSpec)).toBe(
      await computeContentHash(buildSpec),
    );
    const exported = await exportBuildSpec({
      buildSpec,
      operationalMetadata: {
        exportedAt,
        exportedBy: "human:test",
        toolVersion: "2.0.0",
      },
    });
    expect(exported.ok && exported.value.contentSha256).toBe(
      buildSpec.buildSpecContentSha256,
    );
  });

  it("round-trips only schema-valid hash-authenticated v2 payloads", async () => {
    const buildSpec = await buildSpecV2();
    const exported = await exportBuildSpec({
      buildSpec,
      operationalMetadata: {
        exportedAt,
        exportedBy: "human:test",
        toolVersion: "2.0.0",
      },
    });
    if (!exported.ok) throw new Error("Expected export success.");
    const imported = await importBuildSpec(exported.value, {
      importedAt,
      importedBy: "human:test",
    });
    expect(imported.ok && imported.value.buildSpec).toEqual(buildSpec);
  });

  it("fails closed on tampering", async () => {
    const buildSpec = await buildSpecV2();
    const exported = await exportBuildSpec({
      buildSpec,
      operationalMetadata: {
        exportedAt,
        exportedBy: "human:test",
        toolVersion: "2.0.0",
      },
    });
    if (!exported.ok) throw new Error("Expected export success.");
    const imported = await importBuildSpec(
      {
        ...exported.value,
        buildSpec: { ...buildSpec, ruleSetVersion: "tampered" },
      },
      { importedAt, importedBy: "human:test" },
    );
    expect(imported).toMatchObject({
      ok: false,
      error: { code: "BUILD_SPEC_HASH_MISMATCH" },
    });
  });

  it("rejects semantically tampered payloads even when both hashes are recomputed", async () => {
    const buildSpec = await buildSpecV2();
    const tampered = {
      ...buildSpec,
      executionOrder: { ...buildSpec.executionOrder, maxDepth: 999 },
    };
    const rehashed = {
      ...tampered,
      buildSpecContentSha256: await computeContentHash(tampered),
    };
    const imported = await importBuildSpec(
      {
        buildSpec: rehashed,
        contentSha256: rehashed.buildSpecContentSha256,
      },
      { importedAt, importedBy: "human:test" },
    );
    expect(imported).toMatchObject({
      ok: false,
      error: { code: "BUILD_SPEC_SCHEMA_INVALID" },
    });
  });

  it("rejects forged embedded validation even when rehashed", async () => {
    const buildSpec = await buildSpecV2();
    const tampered = {
      ...buildSpec,
      validation: {
        ...buildSpec.validation,
        warnings: [
          {
            code: "LARGE_FORMULA" as const,
            message: "forged",
            field: null,
            context: {},
          },
        ],
      },
    };
    const rehashed = {
      ...tampered,
      buildSpecContentSha256: await computeContentHash(tampered),
    };
    expect(
      await importBuildSpec(
        { buildSpec: rehashed, contentSha256: rehashed.buildSpecContentSha256 },
        { importedAt, importedBy: "human:test" },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "BUILD_SPEC_SCHEMA_INVALID" },
    });
    expect(
      await exportBuildSpec({
        buildSpec: rehashed,
        operationalMetadata: {
          exportedAt,
          exportedBy: "human:test",
          toolVersion: "2.0.0",
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "BUILD_SPEC_SCHEMA_INVALID" },
    });
  });

  it("canonicalizes semantically set-like governance collections", async () => {
    const buildSpec = await buildSpecV2();
    const reordered = {
      ...buildSpec,
      formulas: [...buildSpec.formulas].reverse().map((formula) => ({
        ...formula,
        provenance: {
          ...formula.provenance,
          sourcePlanRules: [...formula.provenance.sourcePlanRules].reverse(),
          affectedTestIds: [...formula.provenance.affectedTestIds].reverse(),
          validationOracleIds: [
            ...formula.provenance.validationOracleIds,
          ].reverse(),
        },
      })),
      cellMappings: [...buildSpec.cellMappings].reverse(),
      namedRanges: [...buildSpec.namedRanges].reverse(),
    };
    expect(await computeContentHash(reordered)).toBe(
      buildSpec.buildSpecContentSha256,
    );
    const identityInput = ({
      buildSpecId: ignoredBuildSpecId,
      validation: ignoredValidation,
      buildSpecContentSha256: ignoredHash,
      ...value
    }: typeof buildSpec) => {
      void ignoredBuildSpecId;
      void ignoredValidation;
      void ignoredHash;
      return deterministicBuildSpecIdentityPayload(value);
    };
    expect(
      await deterministicUuid("BuildSpecV2", identityInput(reordered)),
    ).toBe(await deterministicUuid("BuildSpecV2", identityInput(buildSpec)));
  });

  it("binds deterministic identity and content hash to architecture identity and content", async () => {
    const buildSpec = await buildSpecV2();
    const changed = {
      ...buildSpec,
      architectureContentSha256: "f".repeat(
        64,
      ) as typeof buildSpec.architectureContentSha256,
    };
    expect(await computeContentHash(changed)).not.toBe(
      buildSpec.buildSpecContentSha256,
    );
  });

  it("rejects v1 and schema-invalid payloads before trust", async () => {
    const buildSpec = await buildSpecV2();
    const imported = await importBuildSpec(
      {
        buildSpec: { ...buildSpec, schemaVersion: "1.0.0" },
        contentSha256: buildSpec.buildSpecContentSha256,
      },
      { importedAt, importedBy: "human:test" },
    );
    expect(imported).toMatchObject({
      ok: false,
      error: { code: "BUILD_SPEC_SCHEMA_INVALID" },
    });
  });
});

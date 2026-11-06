import { describe, expect, it } from "vitest";
import { WorkbookValidationEngine } from "../../../../src/domain/validation-reconciliation/engine";
import { computeContentHash } from "../../../../src/domain/build-spec/serialization";
import { compileBuildSpec } from "../../../../src/domain/formula-compiler/compiler";
import { buildCompiledWorkbook } from "../../../../src/domain/workbook-builder/workbook-builder";
import { hashTyped } from "../../../../src/domain/manifests/canonical-json";
import type { Sha256 } from "../../../../src/domain/shared/types";
import {
  buildSpecV2,
  fixedClock,
  fixedUuid,
} from "../../../fixtures/formula-compiler";

async function fixture() {
  const base = await buildSpecV2([
    { id: "FORMULA-CONSTANT", field: "RESULT", cell: "C1", text: "=1+2" },
  ]);
  const profileHash = "e".repeat(64) as Sha256;
  const changed = {
    ...base,
    cellMappings: base.cellMappings.filter((m) => m.iobClassification !== "I"),
    architectureLineage: {
      ...base.architectureLineage,
      population: [
        {
          candidateKey: "a".repeat(64) as Sha256,
          artifactSha256: "b".repeat(64) as Sha256,
          workbookProfileContentSha256: profileHash,
          approvalDecisionId: "decision",
          approvalDecisionContentSha256: "d".repeat(64) as Sha256,
        },
      ],
    },
  };
  const buildSpec = {
    ...changed,
    buildSpecContentSha256: await computeContentHash(changed),
  };
  const population = {
    status: "approved" as const,
    effectiveDecisionId: "decision",
    effectiveWorkbookProfileContentSha256: profileHash,
    provenance: ["decision"],
  };
  const compilation = await compileBuildSpec({
    buildSpec,
    compilerVersion: "1.0.0",
    clock: fixedClock,
    uuid: fixedUuid,
  });
  const built = await buildCompiledWorkbook(
    {
      buildSpec,
      populationProfile: population,
      workbookProfileContentSha256: profileHash,
      generatorVersion: "1.0.0",
    },
    compilation,
  );
  if (!built.ok) throw new Error(JSON.stringify(built.errors));
  return {
    workbook: built.workbook,
    buildSpec,
    population,
    validatorVersion: "test",
    validatedAt: fixedClock.now(),
  };
}

describe("validation engine source lineage", () => {
  it("accepts matched synthetic source identities for a no-input workbook", async () => {
    const input = await fixture();
    const result = await new WorkbookValidationEngine().validate(input);
    expect(result.status).toBe("valid");
  });
  it("uses the captured source lineage if caller state changes during validation", async () => {
    const input = structuredClone(await fixture());
    const engine = new WorkbookValidationEngine();
    const expected = await engine.validate(input);
    const pending = engine.validate(input);
    (input.population as { effectiveDecisionId: string }).effectiveDecisionId =
      "other";
    (input.buildSpec as { ruleSetVersion: string }).ruleSetVersion = "tampered";
    expect(await pending).toEqual(expected);
  });

  it("blocks stale or different BuildSpecs and population decisions", async () => {
    const input = await fixture();
    const engine = new WorkbookValidationEngine();
    const cases = [
      {
        ...input,
        buildSpec: { ...input.buildSpec, ruleSetVersion: "tampered" },
      },
      {
        ...input,
        buildSpec: { ...input.buildSpec, buildSpecId: fixedUuid.generate() },
      },
      {
        ...input,
        population: { ...input.population, status: "revoked" as const },
      },
      {
        ...input,
        population: { ...input.population, effectiveDecisionId: "other" },
      },
      {
        ...input,
        population: {
          ...input.population,
          effectiveWorkbookProfileContentSha256: "a".repeat(64) as Sha256,
        },
      },
    ];
    for (const candidate of cases) {
      const result = await engine.validate(candidate);
      expect(result.status).toBe("invalid");
      expect(result.errors.map((error) => error.code)).toContain(
        "VALIDATION_SOURCE_LINEAGE_MISMATCH",
      );
      const { validationId, validationContentSha256, validatedAt, ...payload } =
        result;
      void validatedAt;
      const hash = await hashTyped(payload, {
        typeName: "WorkbookValidationResult",
      });
      expect(validationId).toBe(hash);
      expect(validationContentSha256).toBe(hash);
    }
  });
});

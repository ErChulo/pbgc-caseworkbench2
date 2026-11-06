import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildCompiledWorkbook } from "../../../../src/domain/workbook-builder/workbook-builder";
import {
  buildXLSXSpec,
  writeXLSXBuffer,
} from "../../../../src/domain/workbook-builder/serialization";
import { computeWorkbookContentHash } from "../../../../src/domain/workbook-builder/workbook-hash";
import { compileBuildSpec } from "../../../../src/domain/formula-compiler/compiler";
import { createCompiledArtifact } from "../../../../src/domain/formula-compiler/serialization";
import { computeContentHash } from "../../../../src/domain/build-spec/serialization";
import type { Sha256 } from "../../../../src/domain/shared/types";
import {
  buildSpecV2,
  fixedClock,
  fixedUuid,
} from "../../../fixtures/formula-compiler";

async function fixture() {
  const base = await buildSpecV2([
    { id: "FORMULA-F1", field: "SUBTOTAL", cell: "C1", text: "=1+2" },
    {
      id: "FORMULA-F2",
      field: "BENEFIT",
      cell: "D1",
      text: "=C1*0.01",
      dependencies: ["FORMULA-F1"],
    },
  ]);
  const profileHash = "e".repeat(64) as Sha256;
  const withoutHash = {
    ...base,
    cellMappings: base.cellMappings.filter(
      (mapping) => mapping.iobClassification !== "I",
    ),
    architectureLineage: {
      ...base.architectureLineage,
      population: [
        {
          candidateKey: "c".repeat(64) as Sha256,
          artifactSha256: "d".repeat(64) as Sha256,
          workbookProfileContentSha256: profileHash,
          approvalDecisionId: "population-approval-1",
          approvalDecisionContentSha256: "f".repeat(64) as Sha256,
        },
      ],
    },
  };
  const buildSpec = {
    ...withoutHash,
    buildSpecContentSha256: await computeContentHash(withoutHash),
  };
  const input = {
    buildSpec,
    populationProfile: {
      status: "approved" as const,
      effectiveDecisionId: "population-approval-1",
      effectiveWorkbookProfileContentSha256: profileHash,
      provenance: [],
    },
    workbookProfileContentSha256: profileHash,
    generatorVersion: "1.0.0",
  };
  const compilation = await compileBuildSpec({
    buildSpec,
    compilerVersion: "1.0.0",
    clock: fixedClock,
    uuid: fixedUuid,
  });
  if (compilation.status !== "complete" || !compilation.artifact)
    throw new Error(
      `Fixture compilation failed: ${compilation.diagnostics.map((d) => d.code).join(",")}`,
    );
  return { input, compilation, artifact: compilation.artifact };
}

describe("compiled workbook generation", () => {
  it("uses canonical formulas, compiler order and dependencies in model and XLSX", async () => {
    const { input, compilation, artifact } = await fixture();
    const first = await buildCompiledWorkbook(input, compilation);
    const second = await buildCompiledWorkbook(input, compilation);
    expect(first).toEqual(second);
    if (!first.ok) throw new Error(JSON.stringify(first.errors));
    expect(first.workbook.workbookContentSha256).toBe(
      await computeWorkbookContentHash(first.workbook),
    );
    expect(first.workbook.formulaCells.map((f) => f.formulaId)).toEqual(
      artifact.deterministicPayload.executionOrder,
    );
    const bytes = writeXLSXBuffer(buildXLSXSpec(first.workbook));
    expect(bytes).toEqual(writeXLSXBuffer(buildXLSXSpec(first.workbook)));
    const parsed = XLSX.read(bytes, { type: "buffer", sheetStubs: true });
    for (const f of artifact.deterministicPayload.compiledFormulas) {
      const output = first.workbook.formulaCells.find(
        (entry) => entry.formulaId === f.formulaId,
      );
      expect(output?.formulaText).toBe(`=${f.canonicalFormulaText}`);
      expect(output?.dependencies.map((dep) => dep.formulaId)).toEqual(
        f.dependencies,
      );
      const cell = parsed.Sheets[f.target.tabName]?.[f.target.cellAddress] as
        XLSX.CellObject | undefined;
      expect(cell?.f).toBe(f.canonicalFormulaText);
    }
    expect(
      first.workbook.formulaCells.some(
        (f) =>
          f.formulaText !==
          input.buildSpec.formulas.find(
            (source) => source.formulaId === f.formulaId,
          )?.formulaText,
      ),
    ).toBe(true);
  });

  it("rejects incomplete and missing compilation", async () => {
    const { input, compilation } = await fixture();
    for (const candidate of [
      { ...compilation, status: "partial" as const },
      { ...compilation, status: "blocked" as const },
      { ...compilation, artifact: null },
    ]) {
      const result = await buildCompiledWorkbook(input, candidate);
      expect(result.ok).toBe(false);
    }
    expect(
      (
        await buildCompiledWorkbook(
          { ...input, buildSpec: { ...input.buildSpec, formulas: [] } },
          compilation,
        )
      ).ok,
    ).toBe(false);
  });

  it("rejects stale source specs and tampered compiler artifacts, even if rehashed", async () => {
    const { input, compilation, artifact } = await fixture();
    expect(
      (
        await buildCompiledWorkbook(
          {
            ...input,
            buildSpec: { ...input.buildSpec, ruleSetVersion: "stale" },
          },
          compilation,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await buildCompiledWorkbook(input, {
          ...compilation,
          artifact: { ...artifact, contentSha256: "a".repeat(64) as Sha256 },
        })
      ).ok,
    ).toBe(false);
    const first = artifact.deterministicPayload.compiledFormulas[0];
    if (!first) throw new Error("Missing compiled formula");
    const forged = await createCompiledArtifact(
      {
        ...artifact.deterministicPayload,
        compiledFormulas: [
          { ...first, canonicalFormulaText: "999" },
          ...artifact.deterministicPayload.compiledFormulas.slice(1),
        ],
      },
      artifact.operationalMetadata,
    );
    const result = await buildCompiledWorkbook(input, {
      ...compilation,
      artifact: forged,
    });
    expect(result.ok).toBe(false);
  });
  it("blocks unverified participant input even when a column array is supplied", async () => {
    const { input } = await fixture();
    const source = await buildSpecV2();
    const changed = {
      ...input.buildSpec,
      formulas: source.formulas,
      cellMappings: source.cellMappings,
      executionOrder: source.executionOrder,
    };
    const buildSpec = {
      ...changed,
      buildSpecContentSha256: await computeContentHash(changed),
    };
    const compilation = await compileBuildSpec({
      buildSpec,
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    expect(compilation.status).toBe("complete");
    const result = await buildCompiledWorkbook(
      {
        ...input,
        buildSpec,
        populationData: new Map([
          [
            "RETIREES",
            new Map([
              ["COMP", [50000]],
              ["YOS", [10]],
            ]),
          ],
        ]),
      },
      compilation,
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.map((error) => error.code)).toContain(
        "POPULATION_ROUTING_UNVERIFIED",
      );
  });
});

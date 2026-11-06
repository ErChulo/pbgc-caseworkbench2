import { buildCheckedXlsx } from "../../../../src/domain/workbook-builder/checked-xlsx";
import { sha256Bytes } from "../../../../src/domain/shared/digest";
import { validateWorkbook } from "../../../../src/domain/validation-reconciliation/structural-validator";
import { verifyGeneratedXlsx } from "../../../../src/domain/workbook-builder/xlsx-readback";
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
    const structural = await validateWorkbook({
      workbook: first.workbook,
      validatorVersion: "1.0.0",
      validatedAt: fixedClock.now(),
    });
    expect(structural.errors).toEqual([]);
    const workbookSpec = buildXLSXSpec(first.workbook);
    const bytes = writeXLSXBuffer(workbookSpec);
    expect(verifyGeneratedXlsx(workbookSpec, bytes)).toEqual({ ok: true });
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

  it("gates generation on structural validation and hashes the checked XLSX bytes", async () => {
    const { input, compilation } = await fixture();
    const built = await buildCompiledWorkbook(input, compilation);
    if (!built.ok) throw new Error("Synthetic build failed");
    const checked = await buildCheckedXlsx(
      built.workbook,
      "1.0.0",
      fixedClock.now(),
    );
    expect(
      (await buildCheckedXlsx(built.workbook, "", fixedClock.now())).ok,
    ).toBe(false);
    expect(
      (
        await buildCheckedXlsx(
          built.workbook,
          "1.0.0",
          "2026-02-30T00:00:00Z" as ReturnType<typeof fixedClock.now>,
        )
      ).ok,
    ).toBe(false);
    if (!checked.ok) throw new Error(checked.message);
    expect(checked.modelValidation.status).toBe("valid");
    expect(checked.modelValidation.workbookContentSha256).toBe(
      built.workbook.workbookContentSha256,
    );
    expect(checked.sha256).toBe(await sha256Bytes(checked.bytes));
    const blob = new Blob([checked.bytes]);
    checked.bytes[0] = (checked.bytes[0] ?? 0) ^ 1;
    const downloaded = await new Promise<Uint8Array<ArrayBuffer>>(
      (resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => {
          reject(new Error("Synthetic blob read failed"));
        };
        reader.onload = () => {
          if (!(reader.result instanceof ArrayBuffer))
            reject(new Error("Invalid blob"));
          else resolve(new Uint8Array(reader.result));
        };
        reader.readAsArrayBuffer(blob);
      },
    );
    expect(await sha256Bytes(downloaded)).toBe(checked.sha256);
    const sheet = built.workbook.sheets.find((item) =>
      item.cells.some((cell) => cell.kind === "formula"),
    );
    const cell = sheet?.cells.find((item) => item.kind === "formula");
    if (!sheet || !cell) throw new Error("Synthetic formula missing");
    const altered = {
      ...built.workbook,
      sheets: built.workbook.sheets.map((item) =>
        item === sheet
          ? {
              ...item,
              cells: item.cells.map((entry) =>
                entry === cell ? { ...entry, formulaText: "=999" } : entry,
              ),
            }
          : item,
      ),
    };
    const rehashed = {
      ...altered,
      workbookContentSha256: await computeWorkbookContentHash(altered),
    };
    const rejected = await buildCheckedXlsx(
      rehashed,
      "1.0.0",
      fixedClock.now(),
    );
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error("Altered model accepted");
    expect(rejected.message).toContain("FORMULA_WORKSHEET_MISMATCH");
    expect("bytes" in rejected).toBe(false);
  });
  it("blocks a no-formula workbook rather than publishing it as a calculation engine", async () => {
    const { input, compilation } = await fixture();
    const built = await buildCompiledWorkbook(input, compilation);
    if (!built.ok) throw new Error("Synthetic build failed");
    const empty = {
      ...built.workbook,
      formulaCells: [],
      sheets: built.workbook.sheets.map((sheet) => ({
        ...sheet,
        cells: sheet.cells.filter((cell) => cell.kind !== "formula"),
      })),
    };
    const rehashed = {
      ...empty,
      workbookContentSha256: await computeWorkbookContentHash(empty),
    };
    const result = await buildCheckedXlsx(rehashed, "1.0.0", fixedClock.now());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Empty calculation model accepted");
    expect(result.message).toContain("NO_FORMULA_CELLS");
  });
  it("snapshots the workbook before asynchronous validation", async () => {
    const { input, compilation } = await fixture();
    const built = await buildCompiledWorkbook(input, compilation);
    if (!built.ok) throw new Error("Synthetic build failed");
    const workbook = structuredClone(built.workbook);
    const expected = await buildCheckedXlsx(
      workbook,
      "1.0.0",
      fixedClock.now(),
    );
    const pending = buildCheckedXlsx(workbook, "1.0.0", fixedClock.now());
    (workbook as { caseId: string }).caseId = "changed-after-call";
    const actual = await pending;
    expect(actual).toEqual(expected);
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

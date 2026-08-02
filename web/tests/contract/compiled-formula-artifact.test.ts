import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateContract } from "../../src/contracts/schema-validator";
import { compileBuildSpec } from "../../src/domain/formula-compiler/compiler";
import {
  createCompiledArtifact,
  validateCompiledArtifact,
} from "../../src/domain/formula-compiler/serialization";
import {
  buildSpecV2,
  fixedClock,
  fixedUuid,
} from "../fixtures/formula-compiler";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

describe("compiled formula artifact contract", () => {
  it("keeps approved and runtime schema bytes identical", async () => {
    const source = await readFile(
      resolve(
        currentDirectory,
        "../../../specs/006-formula-compiler/contracts/compiled-formula-artifact.schema.json",
      ),
    );
    const runtime = await readFile(
      resolve(
        currentDirectory,
        "../../src/contracts/schemas/compiled-formula-artifact.schema.json",
      ),
    );
    expect(runtime.equals(source)).toBe(true);
  });

  it("accepts a compiler-produced artifact", async () => {
    const result = await compileBuildSpec({
      buildSpec: await buildSpecV2(),
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    if (!result.artifact) throw new Error("Expected a compiled artifact.");
    expect(
      validateContract("compiledFormulaArtifact", result.artifact),
    ).toEqual({ valid: true, issues: [] });
  });

  it("rejects calculation metadata substituted for I/O/B", async () => {
    const result = await compileBuildSpec({
      buildSpec: await buildSpecV2(),
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    if (!result.artifact) throw new Error("Expected a compiled artifact.");
    const formula = result.artifact.deterministicPayload.compiledFormulas[0];
    if (!formula) throw new Error("Expected a compiled formula fixture.");
    const invalid = {
      ...result.artifact,
      deterministicPayload: {
        ...result.artifact.deterministicPayload,
        compiledFormulas: [
          {
            ...formula,
            target: { ...formula.target, iobClassification: "CALCULATION" },
          },
        ],
      },
    };
    expect(validateContract("compiledFormulaArtifact", invalid).valid).toBe(
      false,
    );
  });

  it("detects hash-preserving artifact tampering", async () => {
    const result = await compileBuildSpec({
      buildSpec: await buildSpecV2(),
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    if (!result.artifact) throw new Error("Expected a compiled artifact.");
    const formula = result.artifact.deterministicPayload.compiledFormulas[0];
    if (!formula) throw new Error("Expected a compiled formula fixture.");
    const tampered = {
      ...result.artifact,
      deterministicPayload: {
        ...result.artifact.deterministicPayload,
        compiledFormulas: [
          { ...formula, canonicalFormulaText: "1" },
          ...result.artifact.deterministicPayload.compiledFormulas.slice(1),
        ],
      },
    };
    expect(validateContract("compiledFormulaArtifact", tampered).valid).toBe(
      true,
    );
    expect(await validateCompiledArtifact(tampered)).toEqual({
      valid: false,
      issues: ["CONTENT_HASH_MISMATCH"],
    });
  });

  it("fails closed for malformed runtime input", async () => {
    await expect(
      validateCompiledArtifact({ artifactType: "compiled-formula-artifact" }),
    ).resolves.toMatchObject({ valid: false });
  });

  it("enforces status, execution-order, and diagnostic semantic invariants", async () => {
    const result = await compileBuildSpec({
      buildSpec: await buildSpecV2(),
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    if (!result.artifact) throw new Error("Expected a compiled artifact.");
    const metadata = result.artifact.operationalMetadata;

    const inconsistentStatus = await createCompiledArtifact(
      { ...result.artifact.deterministicPayload, status: "partial" },
      metadata,
    );
    expect(await validateCompiledArtifact(inconsistentStatus)).toEqual({
      valid: false,
      issues: [
        "ARTIFACT_STATUS_INCONSISTENT",
        "DIAGNOSTIC_STATUS_INCONSISTENT",
      ],
    });

    const reversedOrder = await createCompiledArtifact(
      {
        ...result.artifact.deterministicPayload,
        executionOrder: [
          ...result.artifact.deterministicPayload.executionOrder,
        ].reverse(),
      },
      metadata,
    );
    expect(await validateCompiledArtifact(reversedOrder)).toEqual({
      valid: false,
      issues: ["EXECUTION_ORDER_DEPENDENCY_INVALID"],
    });

    const missingId = await createCompiledArtifact(
      {
        ...result.artifact.deterministicPayload,
        executionOrder:
          result.artifact.deterministicPayload.executionOrder.slice(1),
      },
      metadata,
    );
    expect(await validateCompiledArtifact(missingId)).toEqual({
      valid: false,
      issues: [
        "EXECUTION_ORDER_ID_MISMATCH",
        "EXECUTION_ORDER_DEPENDENCY_INVALID",
      ],
    });
  });

  it("derives dependency truth from resolved formula references", async () => {
    const result = await compileBuildSpec({
      buildSpec: await buildSpecV2(),
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    if (!result.artifact) throw new Error("Expected a compiled artifact.");
    const payload = result.artifact.deterministicPayload;
    const withoutDeclaredDependency = await createCompiledArtifact(
      {
        ...payload,
        compiledFormulas: payload.compiledFormulas.map((formula, index) =>
          index === 1 ? { ...formula, dependencies: [] } : formula,
        ),
      },
      result.artifact.operationalMetadata,
    );

    expect(await validateCompiledArtifact(withoutDeclaredDependency)).toEqual({
      valid: false,
      issues: ["RESOLVED_DEPENDENCY_MISMATCH"],
    });
  });

  it("rejects an artifact that does not bind the approved compiler policy", async () => {
    const result = await compileBuildSpec({
      buildSpec: await buildSpecV2(),
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    if (!result.artifact) throw new Error("Expected a compiled artifact.");
    const payload = result.artifact.deterministicPayload;
    const invalidPolicies = [
      { ...payload.compiler, policyId: "unapproved-policy" },
      { ...payload.compiler, policyVersion: "9.9.9" },
      {
        ...payload.compiler,
        policyContentSha256: "f".repeat(
          64,
        ) as typeof payload.compiler.policyContentSha256,
      },
    ];

    for (const compiler of invalidPolicies) {
      const wrongPolicy = await createCompiledArtifact(
        { ...payload, compiler },
        result.artifact.operationalMetadata,
      );
      expect(await validateCompiledArtifact(wrongPolicy)).toEqual({
        valid: false,
        issues: ["COMPILER_POLICY_IDENTITY_INVALID"],
      });
    }
  });

  it("rejects compiled/blocked overlap and inconsistent diagnostics", async () => {
    const blockedResult = await compileBuildSpec({
      buildSpec: await buildSpecV2([
        {
          id: "FORMULA-RETIREES-X-DOR",
          field: "X",
          cell: "C1",
          text: "=UNKNOWN+1",
        },
      ]),
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    if (!blockedResult.artifact)
      throw new Error("Expected a blocked compiler artifact.");
    const payload = blockedResult.artifact.deterministicPayload;
    const withoutDiagnostics = await createCompiledArtifact(
      { ...payload, diagnostics: [] },
      blockedResult.artifact.operationalMetadata,
    );
    expect(await validateCompiledArtifact(withoutDiagnostics)).toEqual({
      valid: false,
      issues: ["DIAGNOSTIC_STATUS_INCONSISTENT"],
    });

    const completeResult = await compileBuildSpec({
      buildSpec: await buildSpecV2(),
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    if (!completeResult.artifact || !payload.blockedFormulas[0])
      throw new Error("Expected compiler fixtures.");
    const compiled = completeResult.artifact.deterministicPayload;
    const overlap = await createCompiledArtifact(
      {
        ...compiled,
        status: "partial",
        blockedFormulas: [
          {
            ...payload.blockedFormulas[0],
            formulaId: compiled.compiledFormulas[0]?.formulaId ?? "",
          },
        ],
        diagnostics: payload.diagnostics,
      },
      completeResult.artifact.operationalMetadata,
    );
    expect((await validateCompiledArtifact(overlap)).issues).toContain(
      "COMPILED_BLOCKED_ID_OVERLAP",
    );
  });
});

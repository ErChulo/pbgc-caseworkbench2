import { hashTyped } from "../manifests/canonical-json";
import { validateContract } from "../../contracts/schema-validator";
import type { Sha256, UtcTimestamp, Uuid } from "../shared/types";
import type { CompiledFormulaArtifact, CompiledFormulaPayload } from "./models";
import { excelScalarV1Policy } from "./policy";

export async function createCompiledArtifact(
  payload: CompiledFormulaPayload,
  operationalMetadata: {
    readonly compilationRunId: Uuid;
    readonly generatedAt: UtcTimestamp;
  },
): Promise<CompiledFormulaArtifact> {
  const contentSha256 = (await hashTyped(payload, {
    schemaId: "compiled-formula-artifact.schema.json",
  })) as Sha256;
  return {
    schemaVersion: "1.0.0",
    artifactType: "compiled-formula-artifact",
    deterministicPayload: payload,
    contentSha256,
    operationalMetadata,
  };
}

export async function verifyCompiledArtifact(
  artifact: CompiledFormulaArtifact,
): Promise<boolean> {
  const actual = (await hashTyped(artifact.deterministicPayload, {
    schemaId: "compiled-formula-artifact.schema.json",
  })) as Sha256;
  return actual === artifact.contentSha256;
}

export async function validateCompiledArtifact(
  artifact: unknown,
): Promise<{ readonly valid: boolean; readonly issues: readonly string[] }> {
  try {
    const contract = validateContract("compiledFormulaArtifact", artifact);
    if (!contract.valid)
      return {
        valid: false,
        issues: contract.issues.map((issue) => issue.code),
      };
    const typedArtifact = artifact as CompiledFormulaArtifact;
    const hashValid = await verifyCompiledArtifact(typedArtifact);
    if (!hashValid) return { valid: false, issues: ["CONTENT_HASH_MISMATCH"] };

    const payload = typedArtifact.deterministicPayload;
    const compiledIds = payload.compiledFormulas.map(
      (formula) => formula.formulaId,
    );
    const blockedIds = payload.blockedFormulas.map(
      (formula) => formula.formulaId,
    );
    const compiledIdSet = new Set(compiledIds);
    const blockedIdSet = new Set(blockedIds);
    const issues: string[] = [];
    const approvedPolicyContentSha256 = (await hashTyped(excelScalarV1Policy, {
      typeName: "CompilerPolicy",
    })) as Sha256;
    if (
      payload.compiler.policyId !== excelScalarV1Policy.policyId ||
      payload.compiler.policyVersion !== excelScalarV1Policy.policyVersion ||
      payload.compiler.policyContentSha256 !== approvedPolicyContentSha256
    )
      issues.push("COMPILER_POLICY_IDENTITY_INVALID");
    const expectedStatus =
      blockedIds.length === 0
        ? "complete"
        : compiledIds.length === 0
          ? "blocked"
          : "partial";
    if (payload.status !== expectedStatus)
      issues.push("ARTIFACT_STATUS_INCONSISTENT");
    if (compiledIds.some((id) => blockedIdSet.has(id)))
      issues.push("COMPILED_BLOCKED_ID_OVERLAP");

    if (
      payload.executionOrder.length !== compiledIds.length ||
      new Set(compiledIds).size !== compiledIds.length ||
      payload.executionOrder.some((id) => !compiledIdSet.has(id))
    )
      issues.push("EXECUTION_ORDER_ID_MISMATCH");
    const positions = new Map(
      payload.executionOrder.map((formulaId, index) => [formulaId, index]),
    );
    const expectedDependencies = new Map(
      payload.compiledFormulas.map((formula) => [
        formula.formulaId,
        [
          ...new Set(
            formula.resolvedReferences
              .filter((reference) => reference.referenceKind === "formula")
              .map((reference) => reference.resolvedIdentity),
          ),
        ].sort(),
      ]),
    );
    if (
      payload.compiledFormulas.some((formula) => {
        const declared = [...formula.dependencies].sort();
        const expected = expectedDependencies.get(formula.formulaId) ?? [];
        return (
          declared.length !== expected.length ||
          declared.some((dependency, index) => dependency !== expected[index])
        );
      })
    )
      issues.push("RESOLVED_DEPENDENCY_MISMATCH");
    if (
      payload.compiledFormulas.some((formula) =>
        (expectedDependencies.get(formula.formulaId) ?? []).some(
          (dependency) =>
            !compiledIdSet.has(dependency) ||
            (positions.get(dependency) ?? Number.MAX_SAFE_INTEGER) >=
              (positions.get(formula.formulaId) ?? -1),
        ),
      )
    )
      issues.push("EXECUTION_ORDER_DEPENDENCY_INVALID");

    const diagnosticByKey = new Map(
      payload.diagnostics.map((entry) => [entry.diagnosticKey, entry]),
    );
    const globalBlockingDiagnostic = payload.diagnostics.some(
      (entry) => entry.formulaId === null && entry.blocksDownstream,
    );
    const diagnosticsInconsistent =
      new Set(payload.diagnostics.map((entry) => entry.diagnosticKey)).size !==
        payload.diagnostics.length ||
      (payload.status === "complete" &&
        payload.diagnostics.some((entry) => entry.blocksDownstream)) ||
      (payload.status !== "complete" &&
        !payload.diagnostics.some((entry) => entry.blocksDownstream)) ||
      payload.diagnostics.some(
        (entry) =>
          entry.formulaId !== null &&
          entry.blocksDownstream &&
          (!blockedIdSet.has(entry.formulaId) ||
            !payload.blockedFormulas
              .find((formula) => formula.formulaId === entry.formulaId)
              ?.diagnosticKeys.includes(entry.diagnosticKey)),
      ) ||
      payload.blockedFormulas.some(
        (formula) =>
          (formula.diagnosticKeys.length === 0 && !globalBlockingDiagnostic) ||
          formula.diagnosticKeys.some((key) => {
            const entry = diagnosticByKey.get(key);
            return entry?.formulaId !== formula.formulaId;
          }),
      );
    if (diagnosticsInconsistent) issues.push("DIAGNOSTIC_STATUS_INCONSISTENT");

    return {
      valid: issues.length === 0,
      issues,
    };
  } catch {
    return { valid: false, issues: ["ARTIFACT_VALIDATION_FAILED"] };
  }
}

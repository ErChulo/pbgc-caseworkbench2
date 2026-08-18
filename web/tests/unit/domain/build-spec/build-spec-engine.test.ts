import { describe, expect, it } from "vitest";
import { buildSpecEngine } from "../../../../src/domain/build-spec/build-spec-engine";
import { computeArchitectureContentSha256 } from "../../../../src/domain/architecture/workspace-adapter";
import type { V1ArchitectureContent } from "../../../../src/domain/architecture/models";
import { authenticatedGovernedInput, hash } from "../../../fixtures/build-spec";
import { ruleContentHash } from "../../../../src/domain/plan-rules/rule-authoring";
import { reauthenticateArchitecture } from "../../../../src/domain/architecture/architecture-builder";

describe("BuildSpec engine", () => {
  it("produces byte-equivalent deterministic outcomes", async () => {
    const input = await authenticatedGovernedInput();
    const first = await buildSpecEngine(input);
    const second = await buildSpecEngine(input);
    expect(first).toEqual(second);
    expect(
      !first.ok &&
        first.errors.every((error) => error.code !== "ARCHITECTURE_INVALID"),
    ).toBe(true);
  });

  it("re-authenticates architecture lineage and exact ranges", async () => {
    const input = await authenticatedGovernedInput();
    const result = await reauthenticateArchitecture(
      input.architecture,
      input.architectureGovernance,
    );
    expect(result.ok).toBe(true);
    expect(
      input.architecture.namedRanges.map((range) => range.name).sort(),
    ).toEqual(["Birth_Date", "Freeze_Date"]);
  });

  it("authenticates architecture hash and semantics before generation", async () => {
    const input = await authenticatedGovernedInput();
    const architecture = {
      ...input.architecture,
      architectureContentSha256: hash("f"),
    };
    const result = await buildSpecEngine({
      architecture,
      architectureGovernance: input.architectureGovernance,
      formulaGovernance: input.formulaGovernance,
    });
    expect(
      !result.ok &&
        result.errors.some(
          (error) => error.code === "ARCHITECTURE_HASH_MISMATCH",
        ),
    ).toBe(true);
  });

  it("authenticates supplied approved plan-rule content hashes", async () => {
    const input = await authenticatedGovernedInput();
    const rule = input.formulaGovernance.approvedPlanRules[0];
    if (!rule) throw new Error("Fixture has no approved rule.");
    const result = await buildSpecEngine({
      architecture: input.architecture,
      architectureGovernance: input.architectureGovernance,
      formulaGovernance: {
        ...input.formulaGovernance,
        approvedPlanRules: [{ ...rule, approvalRationale: "tampered" }],
      },
    });
    expect(
      !result.ok &&
        result.errors.some(
          (error) => error.code === "FORMULA_PROVENANCE_INVALID",
        ),
    ).toBe(true);
  });

  it("rejects architecture policy-version mismatch", async () => {
    const input = await authenticatedGovernedInput();
    const content: V1ArchitectureContent = {
      caseId: input.architecture.caseId,
      schemaVersion: input.architecture.schemaVersion,
      ruleSetVersion: "mismatched-policy",
      lineage: input.architecture.lineage,
      sourceTabs: input.architecture.sourceTabs,
      runs: input.architecture.runs,
      cells: input.architecture.cells,
      formulaDependencies: input.architecture.formulaDependencies,
      namedRanges: input.architecture.namedRanges,
    };
    const architecture = {
      ...input.architecture,
      ...content,
      architectureContentSha256:
        await computeArchitectureContentSha256(content),
    };
    const result = await buildSpecEngine({
      architecture,
      architectureGovernance: input.architectureGovernance,
      formulaGovernance: input.formulaGovernance,
    });
    expect(
      !result.ok &&
        result.errors.some(
          (error) => error.code === "ARCHITECTURE_RULE_SET_MISMATCH",
        ),
    ).toBe(true);
  });

  it("rejects forged semantic lineage even when its architecture hash is recomputed", async () => {
    const input = await authenticatedGovernedInput();
    const content: V1ArchitectureContent = {
      ...input.architecture,
      runs: input.architecture.runs.map((run) => ({
        ...run,
        runLabel: `${run.runLabel} forged`,
      })),
    };
    const result = await buildSpecEngine({
      ...input,
      architecture: {
        ...input.architecture,
        ...content,
        architectureContentSha256:
          await computeArchitectureContentSha256(content),
      },
    });
    expect(
      !result.ok &&
        result.errors.some(
          (error) =>
            error.code === "ARCHITECTURE_INVALID" &&
            error.message.includes("original governed records"),
        ),
    ).toBe(true);
  });

  it("rejects a hash-valid rule whose source is stale or outside current authority", async () => {
    const input = await authenticatedGovernedInput();
    const rule = input.formulaGovernance.approvedPlanRules[0];
    if (!rule) throw new Error("Missing governed rule fixture.");
    const { ruleContentSha256: ignored, ...content } = rule;
    void ignored;
    const changed = {
      ...content,
      primaryCitation: {
        ...content.primaryCitation,
        artifactSha256: hash("f"),
      },
    };
    const staleRule = {
      ...changed,
      ruleContentSha256: await ruleContentHash(changed),
    };
    const result = await buildSpecEngine({
      ...input,
      formulaGovernance: {
        ...input.formulaGovernance,
        approvedPlanRules: [staleRule],
      },
    });
    expect(
      !result.ok &&
        result.errors.some(
          (error) => error.code === "FORMULA_PROVENANCE_INVALID",
        ),
    ).toBe(true);
  });

  it("aggregates governance and dependency blockers", async () => {
    const input = await authenticatedGovernedInput();
    const original = input.architecture;
    const content: V1ArchitectureContent = {
      caseId: original.caseId,
      schemaVersion: original.schemaVersion,
      ruleSetVersion: original.ruleSetVersion,
      lineage: original.lineage,
      sourceTabs: original.sourceTabs,
      runs: original.runs,
      cells: original.cells,
      formulaDependencies: original.formulaDependencies,
      namedRanges: original.namedRanges,
    };
    const invalidContent: V1ArchitectureContent = {
      ...content,
      formulaDependencies: [
        ...content.formulaDependencies,
        {
          dependentKey: "RETIREES::D1",
          dependencyKey: "missing",
          runId: "DOR",
          referenceType: "external",
        },
      ],
    };
    const architecture = {
      architectureId: original.architectureId,
      builtAt: original.builtAt,
      ...invalidContent,
      architectureContentSha256:
        await computeArchitectureContentSha256(invalidContent),
    };
    const result = await buildSpecEngine({
      architecture,
      architectureGovernance: input.architectureGovernance,
      formulaGovernance: { approvedPlanRules: [], formulas: [] },
    });
    expect(
      !result.ok && new Set(result.errors.map((error) => error.code)),
    ).toEqual(
      expect.objectContaining(
        new Set([
          "ARCHITECTURE_INVALID",
          "UNSATISFIED_DEPENDENCY",
          "FORMULA_GOVERNANCE_INVALID",
        ]),
      ),
    );
  });
});

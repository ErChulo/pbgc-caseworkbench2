import { describe, expect, it } from "vitest";
import {
  extractDependencies,
  generateFormulaDefinitions,
  generateFormulaId,
} from "../../../../src/domain/build-spec/formula-mapper";
import { formulaApprovalContentHash } from "../../../../src/domain/build-spec/formula-approval";
import { uuid } from "../../../fixtures/build-spec";
import {
  createGovernedArchitecture,
  formulaGovernance,
} from "../../../fixtures/build-spec";

describe("formula mapper", () => {
  it("uses only observed nonempty O/B formulas and exact architecture dependencies", async () => {
    const architecture = createGovernedArchitecture();
    const result = await generateFormulaDefinitions({
      architecture,
      governance: await formulaGovernance(),
    });
    expect(result.errors).toEqual([]);
    expect(result.formulas.map((formula) => formula.genericField)).toEqual([
      "SUBTOTAL",
      "BENEFIT",
    ]);
    const benefit = result.formulas.find(
      (formula) => formula.genericField === "BENEFIT",
    );
    const subtotal = result.formulas.find(
      (formula) => formula.genericField === "SUBTOTAL",
    );
    expect(benefit?.dependencies).toEqual([subtotal?.formulaId]);
    expect(benefit?.provenance.sourcePlanRules[0]?.reviewStatus).toBe(
      "human-approved",
    );
  });

  it("creates deterministic collision-safe identities from exact keys", () => {
    const architecture = createGovernedArchitecture();
    const run = architecture.runs[0];
    const cell = architecture.cells.get("RETIREES::D1");
    if (!run || !cell) throw new Error("Synthetic fixture is incomplete.");
    expect(generateFormulaId(cell, run)).toBe(generateFormulaId(cell, run));
    expect(generateFormulaId(cell, run)).not.toBe(
      generateFormulaId({ ...cell, key: "RETIREES::D_1" }, run),
    );
  });

  it("never substring-matches dependencies", () => {
    const architecture = createGovernedArchitecture();
    const run = architecture.runs[0];
    const cell = architecture.cells.get("RETIREES::D1");
    if (!run || !cell) throw new Error("Synthetic fixture is incomplete.");
    expect(
      extractDependencies(
        { ...cell, formulaText: "=SUBTOTALISH" },
        run,
        architecture,
      ),
    ).toHaveLength(1);
    expect(
      extractDependencies(cell, run, {
        ...architecture,
        formulaDependencies: [],
      }),
    ).toEqual([]);
  });

  it("fails closed when formula governance is absent", async () => {
    const result = await generateFormulaDefinitions({
      architecture: createGovernedArchitecture(),
      governance: { approvedPlanRules: [], formulas: [] },
    });
    expect(result.formulas).toEqual([]);
    expect(result.errors).toHaveLength(2);
  });

  it("rejects tampered and revoked formula approval chains", async () => {
    const architecture = createGovernedArchitecture();
    const governance = await formulaGovernance();
    const entry = governance.formulas[0];
    const approved = entry?.approvalDecisions[0];
    if (!entry || !approved) throw new Error("Missing approval fixture.");

    const tampered = await generateFormulaDefinitions({
      architecture,
      governance: {
        ...governance,
        formulas: [
          {
            ...entry,
            approvalDecisions: [{ ...approved, rationale: "forged" }],
          },
        ],
      },
    });
    expect(
      tampered.errors.some((error) => error.message.includes("content hash")),
    ).toBe(true);

    const revokedContent = {
      ...approved,
      decisionId: uuid("799"),
      appendOrdinal: 2,
      priorDecisionId: approved.decisionId,
      priorDecisionContentSha256: approved.decisionContentSha256,
      decisionType: "revoke" as const,
      resultingStatus: "revoked" as const,
      decidedAt: "2026-07-28T12:01:00Z" as typeof approved.decidedAt,
    };
    const revoked = {
      ...revokedContent,
      decisionContentSha256: await formulaApprovalContentHash(revokedContent),
    };
    const result = await generateFormulaDefinitions({
      architecture,
      governance: {
        ...governance,
        formulas: [
          { ...entry, approvalDecisions: [approved, revoked] },
          ...governance.formulas.slice(1),
        ],
      },
    });
    expect(
      result.errors.some((error) => error.message.includes("non-revoked")),
    ).toBe(true);
  });
});

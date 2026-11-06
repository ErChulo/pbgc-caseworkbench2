import { describe, expect, it } from "vitest";
import { compiledWorkbookBlocker } from "../../../src/app/utilities/compiled-workbook-gate";
import type { BuildSpecV2 } from "../../../src/domain/build-spec/models";
import type { CompilationResult } from "../../../src/domain/formula-compiler/models";

const spec = {
  buildSpecId: "id",
  buildSpecContentSha256: "hash",
  formulas: [
    { formulaId: "f", formulaText: "=1", tabName: "Sheet", cellAddress: "A1" },
  ],
} as unknown as BuildSpecV2;
const complete = {
  status: "complete",
  diagnostics: [],
  artifact: {
    deterministicPayload: {
      status: "complete",
      blockedFormulas: [],
      sourceBuildSpec: { buildSpecId: "id", buildSpecContentSha256: "hash" },
      compiledFormulas: [
        {
          formulaId: "f",
          sourceFormulaText: "=1",
          canonicalFormulaText: "1",
          target: { tabName: "Sheet", cellAddress: "A1" },
        },
      ],
    },
  },
} as unknown as CompilationResult;
describe("compiled workbook gate", () => {
  it("allows exact source and compiler output", () => {
    expect(compiledWorkbookBlocker(spec, complete)).toBeNull();
  });
  it.each(["blocked", "partial"] as const)(
    "blocks %s compilation",
    (status) => {
      expect(
        compiledWorkbookBlocker(spec, { ...complete, status }),
      ).not.toBeNull();
    },
  );
  it("blocks missing artifact, stale builds and non-identical canonical output", () => {
    expect(
      compiledWorkbookBlocker(spec, { ...complete, artifact: null }),
    ).not.toBeNull();
    expect(
      compiledWorkbookBlocker(
        { ...spec, buildSpecId: "other" } as BuildSpecV2,
        complete,
      ),
    ).not.toBeNull();
    expect(
      compiledWorkbookBlocker(
        {
          ...spec,
          formulas: [{ ...spec.formulas[0], formulaText: "=2" }],
        } as BuildSpecV2,
        complete,
      ),
    ).not.toBeNull();
  });
  it("blocks a canonical formula that differs from the source even when compilation says complete", () => {
    const artifact = complete.artifact;
    if (artifact === null) throw new Error("missing fixture");
    const formula = artifact.deterministicPayload.compiledFormulas[0];
    if (!formula) throw new Error("missing formula");
    const altered = {
      ...artifact,
      deterministicPayload: {
        ...artifact.deterministicPayload,
        compiledFormulas: [{ ...formula, canonicalFormulaText: "(1)" }],
      },
    };
    expect(
      compiledWorkbookBlocker(spec, { ...complete, artifact: altered }),
    ).toContain("cannot yet write");
  });
  it("blocks an empty formula set", () => {
    expect(
      compiledWorkbookBlocker({ ...spec, formulas: [] }, complete),
    ).not.toBeNull();
  });
});

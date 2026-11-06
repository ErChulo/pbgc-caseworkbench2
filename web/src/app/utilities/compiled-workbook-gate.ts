import type { BuildSpecV2 } from "../../domain/build-spec/models";
import type { CompilationResult } from "../../domain/formula-compiler/models";

/** The current builder writes source formulas. Permit only exact compiler output. */
export function compiledWorkbookBlocker(
  buildSpec: BuildSpecV2,
  result: CompilationResult,
): string | null {
  const artifact = result.artifact;
  if (
    buildSpec.formulas.length === 0 ||
    result.status !== "complete" ||
    artifact?.deterministicPayload.status !== "complete" ||
    artifact.deterministicPayload.blockedFormulas.length !== 0 ||
    result.diagnostics.some((item) => item.blocksDownstream)
  ) {
    return "Compile all formulas successfully before generating a workbook.";
  }
  const payload = artifact.deterministicPayload;
  if (
    payload.sourceBuildSpec.buildSpecContentSha256 !==
      buildSpec.buildSpecContentSha256 ||
    payload.sourceBuildSpec.buildSpecId !== buildSpec.buildSpecId ||
    payload.compiledFormulas.length !== buildSpec.formulas.length
  ) {
    return "The compiled formulas do not match this BuildSpec.";
  }
  const byId = new Map(
    payload.compiledFormulas.map((formula) => [formula.formulaId, formula]),
  );
  if (
    byId.size !== buildSpec.formulas.length ||
    buildSpec.formulas.some((formula) => {
      const compiled = byId.get(formula.formulaId);
      return (
        compiled?.sourceFormulaText !== formula.formulaText ||
        compiled.target.tabName !== formula.tabName ||
        compiled.target.cellAddress !== formula.cellAddress ||
        formula.formulaText !== `=${compiled.canonicalFormulaText}`
      );
    })
  ) {
    return "Workbook generation is blocked because the builder cannot yet write the compiled formulas exactly.";
  }
  return null;
}

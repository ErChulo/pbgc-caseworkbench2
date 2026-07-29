import type { Sha256 } from "../shared/types";
import { hashTyped } from "../manifests/canonical-json";
import type { CompilationDiagnostic, DiagnosticDraft } from "./models";

export async function materializeDiagnostics(
  drafts: readonly DiagnosticDraft[],
): Promise<readonly CompilationDiagnostic[]> {
  const diagnostics = await Promise.all(
    drafts.map(async (draft) => {
      const identity = {
        code: draft.code,
        category: draft.category,
        severity: draft.severity,
        blocksDownstream: draft.blocksDownstream,
        formulaId: draft.formulaId,
        scenarioId: draft.scenarioId,
        sourceSpan: draft.sourceSpan,
        context: draft.context,
      };
      return {
        ...draft,
        diagnosticKey: (await hashTyped(identity, {
          typeName: "CompilationDiagnosticIdentity",
        })) as Sha256,
      };
    }),
  );
  return diagnostics.sort((left, right) => {
    const leftFormula = left.formulaId ?? "";
    const rightFormula = right.formulaId ?? "";
    const formula =
      leftFormula < rightFormula ? -1 : leftFormula > rightFormula ? 1 : 0;
    if (formula !== 0) return formula;
    const offset =
      (left.sourceSpan?.startOffset ?? -1) -
      (right.sourceSpan?.startOffset ?? -1);
    if (offset !== 0) return offset;
    const code = left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
    if (code !== 0) return code;
    return left.diagnosticKey < right.diagnosticKey
      ? -1
      : left.diagnosticKey > right.diagnosticKey
        ? 1
        : 0;
  });
}

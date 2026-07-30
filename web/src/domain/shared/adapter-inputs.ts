import type { FormulaDefinitionV2, NamedRangeDefinition } from "../build-spec/models";
import type { CompilerPolicy } from "../formula-compiler/models";

export interface CompilerInput {
  readonly formulas: readonly FormulaDefinitionV2[];
  readonly namedRanges: readonly NamedRangeDefinition[];
  readonly policy: CompilerPolicy;
}

export interface WorkbookBuilderInput {
  readonly caseId: string;
  readonly architectureId: string;
  readonly buildSpecId: string;
  readonly namedRanges: readonly NamedRangeDefinition[];
  readonly cellMappings: readonly {
    readonly mappingId: string;
    readonly cellAddress: string;
    readonly iobClassification: string;
    readonly dataSource: unknown;
    readonly formulaId: string | null;
  }[];
}

export interface ValidatorInput {
  readonly buildSpecId: string;
  readonly formulas: readonly { readonly formulaId: string }[];
  readonly namedRanges: readonly NamedRangeDefinition[];
  readonly cellMappings: readonly unknown[];
  readonly validation: { readonly errors: readonly unknown[] };
}

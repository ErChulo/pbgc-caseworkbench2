import type { FormulaProvenance } from "../build-spec/models";
import type { ClockPort, UuidPort } from "../ports";
import type { Sha256, UtcTimestamp, Uuid } from "../shared/types";

export interface SourceSpan {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly offsetUnit: "utf16-code-unit";
}

export type FormulaNode =
  | {
      readonly kind: "number";
      readonly value: string;
      readonly span: SourceSpan;
    }
  | {
      readonly kind: "string";
      readonly value: string;
      readonly span: SourceSpan;
    }
  | {
      readonly kind: "boolean";
      readonly value: boolean;
      readonly span: SourceSpan;
    }
  | {
      readonly kind: "reference";
      readonly sheetName: string | null;
      readonly name: string;
      readonly span: SourceSpan;
    }
  | {
      readonly kind: "unary";
      readonly operator: "+" | "-";
      readonly operand: FormulaNode;
      readonly span: SourceSpan;
    }
  | {
      readonly kind: "binary";
      readonly operator: string;
      readonly left: FormulaNode;
      readonly right: FormulaNode;
      readonly span: SourceSpan;
    }
  | {
      readonly kind: "call";
      readonly functionName: string;
      readonly arguments: readonly FormulaNode[];
      readonly span: SourceSpan;
    };

export interface FunctionPolicy {
  readonly name: string;
  readonly minimumArguments: number;
  readonly maximumArguments: number;
}

export interface CompilerPolicy {
  readonly policyId: "excel-scalar-v1";
  readonly policyVersion: "1.0.0";
  readonly functions: readonly FunctionPolicy[];
  readonly volatileFunctions: readonly string[];
  readonly activeFunctions: readonly string[];
  readonly limits: {
    readonly maximumFormulaLength: number;
    readonly maximumNesting: number;
    readonly maximumTokens: number;
    readonly maximumArguments: number;
  };
}

export type DiagnosticCategory =
  | "contract"
  | "integrity"
  | "provenance"
  | "syntax"
  | "function-policy"
  | "reference"
  | "dependency"
  | "compiler";

export interface DiagnosticDraft {
  readonly code: string;
  readonly category: DiagnosticCategory;
  readonly severity: "informational" | "warning" | "error" | "critical";
  readonly blocksDownstream: boolean;
  readonly formulaId: string | null;
  readonly scenarioId: string | null;
  readonly sourceSpan: SourceSpan | null;
  readonly message: string;
  readonly context: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CompilationDiagnostic extends DiagnosticDraft {
  readonly diagnosticKey: Sha256;
}

export interface FormulaTarget {
  readonly tabName: string;
  readonly cellAddress: string;
  readonly genericField: string;
  readonly iobClassification: "O" | "B";
}

export interface ResolvedReference {
  readonly originalText: string;
  readonly normalizedText: string;
  readonly sourceSpan: SourceSpan;
  readonly referenceKind:
    "cell" | "named-range" | "formula" | "input" | "function";
  readonly resolvedIdentity: string;
  readonly scenarioId: string;
  readonly target: Readonly<Record<string, string>>;
  readonly provenanceRuleContentSha256Values: readonly Sha256[];
}

export interface CompiledFormula {
  readonly formulaId: string;
  readonly status: "compiled";
  readonly scenarioId: string;
  readonly target: FormulaTarget;
  readonly sourceFormulaText: string;
  readonly canonicalFormulaText: string;
  readonly dependencies: readonly string[];
  readonly resolvedReferences: readonly ResolvedReference[];
  readonly provenance: FormulaProvenance;
}

export interface BlockedFormula {
  readonly formulaId: string;
  readonly status: "failed" | "dependency-blocked" | "cycle-blocked";
  readonly scenarioId: string;
  readonly target: FormulaTarget;
  readonly sourceFormulaText: string;
  readonly causalFormulaIds: readonly string[];
  readonly diagnosticKeys: readonly Sha256[];
  readonly provenance: FormulaProvenance;
}

export interface CompiledFormulaPayload {
  readonly sourceBuildSpec: {
    readonly schemaVersion: "2.0.0";
    readonly buildSpecId: Uuid;
    readonly buildSpecContentSha256: Sha256;
    readonly architectureId: Uuid;
    readonly caseId: Uuid;
  };
  readonly compiler: {
    readonly compilerId: "pbgc-caseworkbench-formula-compiler";
    readonly compilerVersion: string;
    readonly policyId: string;
    readonly policyVersion: string;
    readonly policyContentSha256: Sha256;
    readonly canonicalizationProfile: "pbgc-caseworkbench-canonical-json-v1";
  };
  readonly status: "complete" | "partial" | "blocked";
  readonly compiledFormulas: readonly CompiledFormula[];
  readonly blockedFormulas: readonly BlockedFormula[];
  readonly executionOrder: readonly string[];
  readonly diagnostics: readonly CompilationDiagnostic[];
}

export interface CompiledFormulaArtifact {
  readonly schemaVersion: "1.0.0";
  readonly artifactType: "compiled-formula-artifact";
  readonly deterministicPayload: CompiledFormulaPayload;
  readonly contentSha256: Sha256;
  readonly operationalMetadata: {
    readonly compilationRunId: Uuid;
    readonly generatedAt: UtcTimestamp;
  };
}

export interface CompileFormulaRequest {
  readonly buildSpec: unknown;
  readonly policy?: CompilerPolicy;
  readonly compilerVersion: string;
  readonly clock: ClockPort;
  readonly uuid: UuidPort;
}

export interface CompilationResult {
  readonly status: "complete" | "partial" | "blocked";
  readonly artifact: CompiledFormulaArtifact | null;
  readonly diagnostics: readonly CompilationDiagnostic[];
}

export function span(startOffset: number, endOffset: number): SourceSpan {
  return { startOffset, endOffset, offsetUnit: "utf16-code-unit" };
}

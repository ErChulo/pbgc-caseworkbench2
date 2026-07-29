import type { BuildSpecV2, FormulaDefinitionV2 } from "../build-spec/models";
import type { DiagnosticDraft, FormulaNode, ResolvedReference } from "./models";
import type { CompilerPolicy } from "./models";
import { findFunction } from "./policy";
import {
  canonicalCellReference,
  isValidName,
  normalizeCellAddress,
  quoteSheetName,
  referenceKey,
} from "./reference-codec";

export interface ResolutionResult {
  readonly references: readonly ResolvedReference[];
  readonly replacements: ReadonlyMap<string, string>;
  readonly dependencies: readonly string[];
  readonly issues: readonly DiagnosticDraft[];
}

const spanKey = (node: {
  readonly span: { readonly startOffset: number; readonly endOffset: number };
}) => `${String(node.span.startOffset)}:${String(node.span.endOffset)}`;

export function resolveFormulaReferences(
  source: string,
  ast: FormulaNode,
  formula: FormulaDefinitionV2,
  buildSpec: BuildSpecV2,
  policy: CompilerPolicy,
): ResolutionResult {
  const references: ResolvedReference[] = [];
  const replacements = new Map<string, string>();
  const dependencies = new Set<string>();
  const issues: DiagnosticDraft[] = [];
  const provenanceHashes = formula.provenance.sourcePlanRules
    .map((rule) => rule.ruleContentSha256)
    .sort();
  const sheetNames = new Map<string, string>();
  for (const mapping of buildSpec.cellMappings)
    sheetNames.set(mapping.tabName.toUpperCase(), mapping.tabName);
  for (const range of buildSpec.namedRanges)
    sheetNames.set(range.tabName.toUpperCase(), range.tabName);
  sheetNames.set(formula.tabName.toUpperCase(), formula.tabName);
  const fail = (
    code: string,
    category: DiagnosticDraft["category"],
    message: string,
    node: FormulaNode,
    context: DiagnosticDraft["context"] = {},
  ) =>
    issues.push({
      code,
      category,
      severity: "error",
      blocksDownstream: true,
      formulaId: formula.formulaId,
      scenarioId: formula.scenarioId,
      sourceSpan: node.span,
      message,
      context,
    });
  const add = (
    node: FormulaNode,
    normalizedText: string,
    referenceKind: ResolvedReference["referenceKind"],
    resolvedIdentity: string,
    target: Readonly<Record<string, string>>,
  ) => {
    replacements.set(spanKey(node), normalizedText);
    references.push({
      originalText: source.slice(node.span.startOffset, node.span.endOffset),
      normalizedText,
      sourceSpan: node.span,
      referenceKind,
      resolvedIdentity,
      scenarioId: formula.scenarioId,
      target,
      provenanceRuleContentSha256Values: provenanceHashes,
    });
  };
  const visit = (node: FormulaNode): void => {
    if (node.kind === "unary") {
      visit(node.operand);
      return;
    }
    if (node.kind === "binary") {
      visit(node.left);
      visit(node.right);
      return;
    }
    if (node.kind === "call") {
      const name = node.functionName.toUpperCase();
      if (policy.volatileFunctions.includes(name))
        fail(
          "VOLATILE_FUNCTION_PROHIBITED",
          "function-policy",
          `Volatile function ${name} is prohibited.`,
          node,
          { functionName: name },
        );
      else if (policy.activeFunctions.includes(name))
        fail(
          "ACTIVE_FUNCTION_PROHIBITED",
          "function-policy",
          `Active or external function ${name} is prohibited.`,
          node,
          { functionName: name },
        );
      else if (name.startsWith("_XLUDF.") || name.startsWith("_XLFN."))
        fail(
          "USER_DEFINED_FUNCTION_PROHIBITED",
          "function-policy",
          `User-defined function ${name} is prohibited.`,
          node,
          { functionName: name },
        );
      else {
        const allowed = findFunction(policy, name);
        if (!allowed)
          fail(
            "FUNCTION_NOT_ALLOWED",
            "function-policy",
            `Function ${name} is not in policy ${policy.policyVersion}.`,
            node,
            { functionName: name },
          );
        else if (
          node.arguments.length < allowed.minimumArguments ||
          node.arguments.length > allowed.maximumArguments
        )
          fail(
            "FUNCTION_ARITY_INVALID",
            "function-policy",
            `Function ${name} requires ${allowed.minimumArguments === allowed.maximumArguments ? String(allowed.minimumArguments) : `${String(allowed.minimumArguments)}-${String(allowed.maximumArguments)}`} arguments.`,
            node,
            { functionName: name, argumentCount: node.arguments.length },
          );
        else
          add(node, name, "function", `FUNCTION:${name}`, {
            functionName: name,
            policyVersion: policy.policyVersion,
          });
      }
      node.arguments.forEach(visit);
      return;
    }
    if (node.kind !== "reference") return;
    const requestedSheet = node.sheetName
      ? sheetNames.get(node.sheetName.toUpperCase())
      : formula.tabName;
    if (!requestedSheet) {
      fail(
        "UNKNOWN_SHEET",
        "reference",
        `Sheet ${node.sheetName ?? ""} is not defined by the BuildSpec.`,
        node,
        { sheetName: node.sheetName },
      );
      return;
    }
    const cell = normalizeCellAddress(node.name);
    if (cell) {
      const mapping = buildSpec.cellMappings.find(
        (entry) =>
          entry.scenarioId === formula.scenarioId &&
          referenceKey(entry.tabName, entry.cellAddress) ===
            referenceKey(requestedSheet, cell),
      );
      const normalized = canonicalCellReference(requestedSheet, cell);
      if (mapping?.formulaId) {
        dependencies.add(mapping.formulaId);
        add(node, normalized, "formula", mapping.formulaId, {
          formulaId: mapping.formulaId,
          tabName: requestedSheet,
          cellAddress: cell,
        });
      } else if (mapping?.dataSource)
        add(node, normalized, "input", mapping.mappingId, {
          mappingId: mapping.mappingId,
          sourceType: mapping.dataSource.sourceType,
          sourceField: mapping.dataSource.sourceField,
        });
      else
        fail(
          "REFERENCE_UNRESOLVED",
          "reference",
          `Cell ${normalized} is not mapped by the BuildSpec.`,
          node,
          { cellAddress: cell, sheetName: requestedSheet },
        );
      return;
    }
    if (!isValidName(node.name)) {
      fail(
        "INVALID_NAME_REFERENCE",
        "reference",
        `Reference ${node.name} is not a valid workbook name.`,
        node,
        { referenceName: node.name },
      );
      return;
    }
    const name = node.name.toUpperCase();
    const mapping = buildSpec.cellMappings.find(
      (entry) =>
        entry.scenarioId === formula.scenarioId &&
        entry.field.toUpperCase() === name &&
        entry.tabName.toUpperCase() === requestedSheet.toUpperCase(),
    );
    if (mapping?.formulaId) {
      dependencies.add(mapping.formulaId);
      add(
        node,
        canonicalCellReference(mapping.tabName, mapping.cellAddress),
        "formula",
        mapping.formulaId,
        {
          formulaId: mapping.formulaId,
          tabName: mapping.tabName,
          cellAddress: mapping.cellAddress,
        },
      );
      return;
    }
    if (mapping?.dataSource) {
      add(
        node,
        canonicalCellReference(mapping.tabName, mapping.cellAddress),
        "input",
        mapping.mappingId,
        {
          mappingId: mapping.mappingId,
          sourceType: mapping.dataSource.sourceType,
          sourceField: mapping.dataSource.sourceField,
        },
      );
      return;
    }
    const ranges = buildSpec.namedRanges.filter(
      (range) =>
        range.rangeName.toUpperCase() === name &&
        (range.scope === "workbook" ||
          range.tabName.toUpperCase() === requestedSheet.toUpperCase()) &&
        (range.scenarioId === null || range.scenarioId === formula.scenarioId),
    );
    if (ranges.length > 1) {
      fail(
        "REFERENCE_AMBIGUOUS",
        "reference",
        `Reference ${node.name} is ambiguous.`,
        node,
        { referenceName: node.name },
      );
      return;
    }
    const range = ranges[0];
    if (range) {
      const normalized =
        range.scope === "sheet"
          ? `${quoteSheetName(range.tabName)}!${range.rangeName}`
          : range.rangeName;
      add(
        node,
        normalized,
        "named-range",
        `${range.scope}:${range.tabName}:${range.rangeName}`,
        {
          rangeName: range.rangeName,
          scope: range.scope,
          tabName: range.tabName,
          cellAddress: range.cellAddress,
        },
      );
      return;
    }
    fail(
      "REFERENCE_UNRESOLVED",
      "reference",
      `Reference ${node.name} is not defined for scenario ${formula.scenarioId}.`,
      node,
      { referenceName: node.name },
    );
  };
  visit(ast);
  return {
    references: references.sort(
      (a, b) => a.sourceSpan.startOffset - b.sourceSpan.startOffset,
    ),
    replacements,
    dependencies: [...dependencies].sort(),
    issues,
  };
}

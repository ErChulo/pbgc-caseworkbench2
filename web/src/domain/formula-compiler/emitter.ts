import type { FormulaNode } from "./models";

const key = (node: FormulaNode) =>
  `${String(node.span.startOffset)}:${String(node.span.endOffset)}`;
const quoteText = (value: string) => `"${value.replaceAll('"', '""')}"`;

export function emitCanonicalFormula(
  node: FormulaNode,
  replacements: ReadonlyMap<string, string>,
): string {
  switch (node.kind) {
    case "number":
      return node.value;
    case "string":
      return quoteText(node.value);
    case "boolean":
      return node.value ? "TRUE" : "FALSE";
    case "reference":
      return replacements.get(key(node)) ?? node.name.toUpperCase();
    case "unary":
      return `(${node.operator}${emitCanonicalFormula(node.operand, replacements)})`;
    case "binary":
      return `(${emitCanonicalFormula(node.left, replacements)}${node.operator}${emitCanonicalFormula(node.right, replacements)})`;
    case "call":
      return `${node.functionName.toUpperCase()}(${node.arguments.map((argument) => emitCanonicalFormula(argument, replacements)).join(",")})`;
  }
}

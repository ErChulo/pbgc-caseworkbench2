import { lexFormula, type FormulaToken } from "./lexer";
import type { CompilerPolicy, DiagnosticDraft, FormulaNode } from "./models";
import { span } from "./models";

export type ParseResult =
  | {
      readonly ok: true;
      readonly ast: FormulaNode;
      readonly leadingEqualsNormalized: boolean;
    }
  | { readonly ok: false; readonly issues: readonly DiagnosticDraft[] };
class ParseFailure extends Error {
  constructor(
    readonly token: FormulaToken,
    message: string,
    readonly code = "SYNTAX_ERROR",
  ) {
    super(message);
  }
}

export function parseFormula(
  source: string,
  policy: CompilerPolicy,
): ParseResult {
  const lexed = lexFormula(source, policy);
  if (!lexed.ok) return lexed;
  let position = 0;
  let depth = 0;
  const tokenAt = (index: number): FormulaToken => {
    const token = lexed.tokens[index];
    if (token === undefined)
      throw new Error("Parser advanced beyond the EOF token.");
    return token;
  };
  const current = () => tokenAt(position);
  const consume = () => tokenAt(position++);
  const matchOperator = (values: readonly string[]) =>
    current().kind === "operator" && values.includes(current().value);
  const makeBinary = (
    left: FormulaNode,
    operator: string,
    right: FormulaNode,
  ): FormulaNode => ({
    kind: "binary",
    operator,
    left,
    right,
    span: span(left.span.startOffset, right.span.endOffset),
  });
  const parsePrimary = (): FormulaNode => {
    const token = consume();
    if (token.kind === "number") {
      const [whole = "0", decimal] = token.value.split(".");
      const trimmed = decimal?.replace(/0+$/u, "");
      return {
        kind: "number",
        value: trimmed ? `${whole}.${trimmed}` : whole,
        span: token.span,
      };
    }
    if (token.kind === "string")
      return { kind: "string", value: token.value, span: token.span };
    if (token.kind === "left-paren") {
      depth += 1;
      if (depth > policy.limits.maximumNesting)
        throw new ParseFailure(
          token,
          "Formula nesting exceeds the approved limit.",
          "RESOURCE_LIMIT_EXCEEDED",
        );
      const expression = parseComparison();
      if (current().kind !== "right-paren")
        throw new ParseFailure(current(), "Expected a closing parenthesis.");
      const end = consume();
      depth -= 1;
      return {
        ...expression,
        span: span(token.span.startOffset, end.span.endOffset),
      };
    }
    if (token.kind === "identifier") {
      const upper = token.value.toUpperCase();
      if (
        (upper === "TRUE" || upper === "FALSE") &&
        current().kind !== "left-paren"
      )
        return { kind: "boolean", value: upper === "TRUE", span: token.span };
      if (current().kind === "left-paren") {
        consume();
        depth += 1;
        if (depth > policy.limits.maximumNesting)
          throw new ParseFailure(
            token,
            "Formula nesting exceeds the approved limit.",
            "RESOURCE_LIMIT_EXCEEDED",
          );
        const args: FormulaNode[] = [];
        if (current().kind !== "right-paren") {
          let hasMore = true;
          while (hasMore) {
            args.push(parseComparison());
            hasMore = current().kind === "comma";
            if (hasMore) consume();
          }
        }
        if (current().kind !== "right-paren")
          throw new ParseFailure(
            current(),
            "Expected a closing parenthesis after function arguments.",
          );
        const end = consume();
        depth -= 1;
        return {
          kind: "call",
          functionName: upper,
          arguments: args,
          span: span(token.span.startOffset, end.span.endOffset),
        };
      }
      if (current().kind === "bang") {
        consume();
        const reference = consume();
        if (reference.kind !== "identifier")
          throw new ParseFailure(
            reference,
            "Expected a cell or name after the sheet qualifier.",
          );
        return {
          kind: "reference",
          sheetName: token.value,
          name: reference.value,
          span: span(token.span.startOffset, reference.span.endOffset),
        };
      }
      return {
        kind: "reference",
        sheetName: null,
        name: token.value,
        span: token.span,
      };
    }
    if (token.kind === "quoted-sheet") {
      if (current().kind !== "bang")
        throw new ParseFailure(
          current(),
          "Quoted sheet names must qualify a reference.",
        );
      consume();
      const reference = consume();
      if (reference.kind !== "identifier")
        throw new ParseFailure(
          reference,
          "Expected a cell or name after the sheet qualifier.",
        );
      return {
        kind: "reference",
        sheetName: token.value,
        name: reference.value,
        span: span(token.span.startOffset, reference.span.endOffset),
      };
    }
    throw new ParseFailure(
      token,
      "Expected a literal, reference, function, or parenthesized expression.",
      "UNEXPECTED_TOKEN",
    );
  };
  const parseUnary = (): FormulaNode =>
    matchOperator(["+", "-"])
      ? (() => {
          const operator = consume();
          const operand = parseUnary();
          return {
            kind: "unary",
            operator: operator.value as "+" | "-",
            operand,
            span: span(operator.span.startOffset, operand.span.endOffset),
          };
        })()
      : parsePrimary();
  const parsePower = (): FormulaNode => {
    let left = parseUnary();
    while (matchOperator(["^"])) {
      const op = consume();
      left = makeBinary(left, op.value, parseUnary());
    }
    return left;
  };
  const parseMultiplicative = (): FormulaNode => {
    let left = parsePower();
    while (matchOperator(["*", "/"])) {
      const op = consume();
      left = makeBinary(left, op.value, parsePower());
    }
    return left;
  };
  const parseAdditive = (): FormulaNode => {
    let left = parseMultiplicative();
    while (matchOperator(["+", "-"])) {
      const op = consume();
      left = makeBinary(left, op.value, parseMultiplicative());
    }
    return left;
  };
  const parseConcatenation = (): FormulaNode => {
    let left = parseAdditive();
    while (matchOperator(["&"])) {
      const op = consume();
      left = makeBinary(left, op.value, parseAdditive());
    }
    return left;
  };
  const parseComparison = (): FormulaNode => {
    const left = parseConcatenation();
    if (!matchOperator(["=", "<>", "<", "<=", ">", ">="])) return left;
    const op = consume();
    const result = makeBinary(left, op.value, parseConcatenation());
    if (matchOperator(["=", "<>", "<", "<=", ">", ">="]))
      throw new ParseFailure(
        current(),
        "Chained comparisons are not supported.",
      );
    return result;
  };
  try {
    let leadingEqualsNormalized = false;
    if (current().kind === "operator" && current().value === "=") {
      consume();
      leadingEqualsNormalized = true;
      if (current().kind === "operator" && current().value === "=")
        throw new ParseFailure(
          current(),
          "Only one leading equals sign is permitted.",
          "MULTIPLE_LEADING_EQUALS",
        );
    }
    const ast = parseComparison();
    if (current().kind !== "eof")
      throw new ParseFailure(
        current(),
        "Unexpected token after the formula expression.",
        "UNEXPECTED_TOKEN",
      );
    return { ok: true, ast, leadingEqualsNormalized };
  } catch (error) {
    const failure = error as ParseFailure;
    return {
      ok: false,
      issues: [
        {
          code: failure.code,
          category: "syntax",
          severity: "error",
          blocksDownstream: true,
          formulaId: null,
          scenarioId: null,
          sourceSpan: failure.token.span,
          message: failure.message,
          context: { token: failure.token.text },
        },
      ],
    };
  }
}

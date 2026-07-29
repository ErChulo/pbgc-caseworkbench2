import type { CompilerPolicy, DiagnosticDraft, SourceSpan } from "./models";
import { span } from "./models";

export type TokenKind =
  | "number"
  | "string"
  | "identifier"
  | "quoted-sheet"
  | "operator"
  | "left-paren"
  | "right-paren"
  | "comma"
  | "bang"
  | "eof";
export interface FormulaToken {
  readonly kind: TokenKind;
  readonly text: string;
  readonly value: string;
  readonly span: SourceSpan;
}
export type LexResult =
  | { readonly ok: true; readonly tokens: readonly FormulaToken[] }
  | { readonly ok: false; readonly issues: readonly DiagnosticDraft[] };

const issue = (
  code: string,
  message: string,
  sourceSpan: SourceSpan,
): DiagnosticDraft => ({
  code,
  category: "syntax",
  severity: "error",
  blocksDownstream: true,
  formulaId: null,
  scenarioId: null,
  sourceSpan,
  message,
  context: {},
});

export function lexFormula(source: string, policy: CompilerPolicy): LexResult {
  if (source.length === 0)
    return {
      ok: false,
      issues: [issue("EMPTY_FORMULA", "Formula text is empty.", span(0, 0))],
    };
  if (source.length > policy.limits.maximumFormulaLength)
    return {
      ok: false,
      issues: [
        issue(
          "FORMULA_TOO_LONG",
          "Formula exceeds the approved length limit.",
          span(0, source.length),
        ),
      ],
    };
  const tokens: FormulaToken[] = [];
  let index = 0;
  const add = (
    kind: TokenKind,
    start: number,
    end: number,
    value = source.slice(start, end),
  ) =>
    tokens.push({
      kind,
      text: source.slice(start, end),
      value,
      span: span(start, end),
    });
  while (index < source.length) {
    const char = source.charAt(index);
    if (char === " " || char === "\t") {
      index += 1;
      continue;
    }
    if (char < " " || char === "\u007f")
      return {
        ok: false,
        issues: [
          issue(
            "INVALID_CHARACTER",
            "Control characters are not permitted in formulas.",
            span(index, index + 1),
          ),
        ],
      };
    const start = index;
    if (char === '"') {
      index += 1;
      let value = "";
      let closed = false;
      while (index < source.length) {
        if (source[index] === '"') {
          if (source[index + 1] === '"') {
            value += '"';
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        value += source.charAt(index);
        index += 1;
      }
      if (!closed)
        return {
          ok: false,
          issues: [
            issue(
              "UNTERMINATED_STRING",
              "Text literal is not terminated.",
              span(start, source.length),
            ),
          ],
        };
      add("string", start, index, value);
      continue;
    }
    if (char === "'") {
      index += 1;
      let value = "";
      let closed = false;
      while (index < source.length) {
        if (source[index] === "'") {
          if (source[index + 1] === "'") {
            value += "'";
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        value += source.charAt(index);
        index += 1;
      }
      if (!closed)
        return {
          ok: false,
          issues: [
            issue(
              "UNTERMINATED_SHEET_NAME",
              "Quoted sheet name is not terminated.",
              span(start, source.length),
            ),
          ],
        };
      add("quoted-sheet", start, index, value);
      continue;
    }
    if (/[0-9]/u.test(char)) {
      index += 1;
      while (/[0-9]/u.test(source[index] ?? "")) index += 1;
      if (source[index] === ".") {
        index += 1;
        const decimalStart = index;
        while (/[0-9]/u.test(source[index] ?? "")) index += 1;
        if (decimalStart === index)
          return {
            ok: false,
            issues: [
              issue(
                "INVALID_NUMBER",
                "Decimal point must be followed by digits.",
                span(start, index),
              ),
            ],
          };
      }
      if (
        /[Ee]/u.test(source[index] ?? "") ||
        (source[start] === "0" &&
          index - start > 1 &&
          source[start + 1] !== ".")
      )
        return {
          ok: false,
          issues: [
            issue(
              "INVALID_NUMBER",
              "Use canonical plain decimal notation.",
              span(start, index + (/[Ee]/u.test(source[index] ?? "") ? 1 : 0)),
            ),
          ],
        };
      add("number", start, index);
      continue;
    }
    if (/[A-Za-z_$]/u.test(char)) {
      index += 1;
      while (/[A-Za-z0-9_.$]/u.test(source[index] ?? "")) index += 1;
      add("identifier", start, index);
      continue;
    }
    if (char === "(") {
      index += 1;
      add("left-paren", start, index);
      continue;
    }
    if (char === ")") {
      index += 1;
      add("right-paren", start, index);
      continue;
    }
    if (char === ",") {
      index += 1;
      add("comma", start, index);
      continue;
    }
    if (char === "!") {
      index += 1;
      add("bang", start, index);
      continue;
    }
    const two = source.slice(index, index + 2);
    if (["<=", ">=", "<>"].includes(two)) {
      index += 2;
      add("operator", start, index);
      continue;
    }
    if (["+", "-", "*", "/", "^", "&", "=", "<", ">"].includes(char)) {
      index += 1;
      add("operator", start, index);
      continue;
    }
    const prohibited: Record<string, string> = {
      "[": "EXTERNAL_REFERENCE_PROHIBITED",
      "]": "EXTERNAL_REFERENCE_PROHIBITED",
      "{": "ARRAY_SYNTAX_PROHIBITED",
      "}": "ARRAY_SYNTAX_PROHIBITED",
      ":": "RANGE_REFERENCE_PROHIBITED",
      "#": "DYNAMIC_ARRAY_PROHIBITED",
      "@": "DYNAMIC_ARRAY_PROHIBITED",
    };
    return {
      ok: false,
      issues: [
        issue(
          prohibited[char] ?? "INVALID_CHARACTER",
          `Unsupported formula character: ${char}`,
          span(index, index + 1),
        ),
      ],
    };
  }
  add("eof", source.length, source.length, "");
  if (tokens.length > policy.limits.maximumTokens)
    return {
      ok: false,
      issues: [
        issue(
          "RESOURCE_LIMIT_EXCEEDED",
          "Formula exceeds the approved token limit.",
          span(0, source.length),
        ),
      ],
    };
  return { ok: true, tokens };
}

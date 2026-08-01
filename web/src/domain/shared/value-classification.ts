/**
 * Shared value classification utilities for population and architecture modules.
 *
 * Extracted from tabular-adapter.ts, population-detector.ts, and field-inventory.ts
 * to eliminate triple duplication and decouple peer modules.
 */

export type RawValueKind =
  | "missing"
  | "blank"
  | "malformed"
  | "formula-text"
  | "leading-zero-text"
  | "literal-zero"
  | "text"
  | "number"
  | "boolean"
  | "null"
  | "structured";

/**
 * Classifies a raw cell value into a semantic kind.
 * Never invents or imputes missing values.
 */
export function classifyRawValue(value: unknown, present = true): RawValueKind {
  if (!present || value === undefined) return "missing";
  if (value === null) return "null";
  if (typeof value === "string") {
    if (value === "") return "blank";
    if (/^[=+\-@]/u.test(value)) return "formula-text";
    if (/^0[0-9]+$/u.test(value)) return "leading-zero-text";
    if (/^(?:#(?:N\/A|VALUE!|REF!|DIV\/0!)|INVALID)$/iu.test(value))
      return "malformed";
    if (value === "0") return "literal-zero";
    return "text";
  }
  if (typeof value === "number") return value === 0 ? "literal-zero" : "number";
  if (typeof value === "boolean") return "boolean";
  return "structured";
}

/**
 * Converts a primitive value to its display string representation.
 * Returns empty string for null, undefined, or object values.
 */
export function primitiveDisplay(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  return "";
}

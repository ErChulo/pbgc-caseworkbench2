import type { PassiveExtraction } from "../../adapters/parsers/passive-result";

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

export interface RawValueObservation {
  readonly row: number;
  readonly column: number;
  readonly value: unknown;
  readonly kind: RawValueKind;
}

export interface TabularPopulationProfile {
  readonly parserId: string;
  readonly mediaType: string;
  readonly encoding: string | null;
  readonly status: "profiled" | "blocked";
  readonly structurallyValid: boolean;
  readonly headers: readonly string[];
  readonly rowWidths: readonly number[];
  readonly observations: readonly RawValueObservation[];
  readonly limitations: readonly string[];
}

export function adaptTabularExtraction(
  extraction: PassiveExtraction,
): TabularPopulationProfile {
  if (extraction.status !== "success") {
    return Object.freeze({
      parserId: extraction.parserId,
      mediaType: extraction.mediaType,
      encoding: metadataString(extraction, "encoding"),
      status: "blocked",
      structurallyValid: false,
      headers: Object.freeze([]),
      rowWidths: Object.freeze([]),
      observations: Object.freeze([]),
      limitations: Object.freeze([...extraction.limitations]),
    });
  }

  const rows = rowsFromExtraction(extraction);
  if (rows === null) {
    return Object.freeze({
      parserId: extraction.parserId,
      mediaType: extraction.mediaType,
      encoding: metadataString(extraction, "encoding"),
      status: "blocked",
      structurallyValid: false,
      headers: Object.freeze([]),
      rowWidths: Object.freeze([]),
      observations: Object.freeze([]),
      limitations: Object.freeze([
        ...extraction.limitations,
        "Parser output was not a supported tabular structure; no repair was attempted.",
      ]),
    });
  }
  const headers = (rows[0] ?? []).map(primitiveDisplay);
  const observations: RawValueObservation[] = [];
  const maximumWidth = rows.reduce(
    (maximum, row) => Math.max(maximum, row.length),
    0,
  );
  for (let row = 1; row < rows.length; row += 1) {
    const values = rows[row] ?? [];
    for (let column = 0; column < maximumWidth; column += 1) {
      const present = column < values.length;
      const value = present ? values[column] : undefined;
      observations.push(
        Object.freeze({
          row,
          column,
          value,
          kind: classifyRawValue(value, present),
        }),
      );
    }
  }
  const rowWidths = rows.map((row) => row.length);
  const structurallyValid =
    headers.length > 0 &&
    new Set(headers).size === headers.length &&
    rowWidths.every((width) => width === headers.length);
  return Object.freeze({
    parserId: extraction.parserId,
    mediaType: extraction.mediaType,
    encoding: metadataString(extraction, "encoding") ?? "utf-8",
    status: "profiled",
    structurallyValid,
    headers: Object.freeze(headers),
    rowWidths: Object.freeze(rowWidths),
    observations: Object.freeze(observations),
    limitations: Object.freeze([
      ...extraction.limitations,
      ...(structurallyValid
        ? []
        : [
            "Structural variation is preserved as an unresolved finding; no rows or fields were corrected.",
          ]),
    ]),
  });
}

function rowsFromExtraction(
  extraction: PassiveExtraction,
): readonly (readonly unknown[])[] | null {
  if (
    extraction.mediaType === "text/csv" ||
    extraction.mediaType === "text/tab-separated-values"
  ) {
    return extraction.rawValues.every(Array.isArray)
      ? (extraction.rawValues as readonly (readonly unknown[])[])
      : null;
  }
  if (extraction.mediaType === "application/json") {
    const root = extraction.rawValues[0];
    if (!Array.isArray(root)) return null;
    if (root.every(Array.isArray))
      return root as readonly (readonly unknown[])[];
    if (root.every(isRecord)) {
      const headers = [...new Set(root.flatMap((item) => Object.keys(item)))];
      return [
        headers,
        ...root.map((item) =>
          headers.map((header) =>
            Object.prototype.hasOwnProperty.call(item, header)
              ? item[header]
              : undefined,
          ),
        ),
      ];
    }
    return null;
  }
  if (extraction.mediaType.startsWith("text/")) {
    return extraction.rawValues.every((value) => typeof value === "string")
      ? extraction.rawValues.map((value) => [value])
      : null;
  }
  return null;
}

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

function metadataString(
  extraction: PassiveExtraction,
  key: string,
): string | null {
  const value = extraction.metadata[key];
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function primitiveDisplay(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  return "";
}

import {
  failedPassiveExtraction,
  type PassiveExtraction,
} from "./passive-result";
import { parsePlainText } from "./text-parser";

export function parseDelimited(
  bytes: Uint8Array,
  delimiter: "," | "\t",
): PassiveExtraction {
  const decoded = parsePlainText(bytes);
  const mediaType =
    delimiter === "," ? "text/csv" : "text/tab-separated-values";
  if (decoded.status !== "success") {
    return failedPassiveExtraction(
      "delimited-passive",
      mediaType,
      "unreadable",
      decoded.limitations[0] ?? "Delimited input is unreadable.",
    );
  }
  const rows = parseRows(decoded.text, delimiter);
  if (!rows.ok) {
    return failedPassiveExtraction(
      "delimited-passive",
      mediaType,
      "unreadable",
      rows.reason,
    );
  }
  const widths = rows.value.map((row) => row.length);
  return Object.freeze({
    parserId: "delimited-passive",
    parserVersion: "1.0.0",
    status: "success",
    mediaType,
    text: decoded.text,
    metadata: Object.freeze({
      delimiter,
      rowCount: rows.value.length,
      minimumWidth: widths.length === 0 ? 0 : Math.min(...widths),
      maximumWidth: widths.length === 0 ? 0 : Math.max(...widths),
    }),
    rawValues: Object.freeze(rows.value.map((row) => Object.freeze(row))),
    limitations: Object.freeze([]),
    riskIndicators: Object.freeze([]),
  });
}

export async function parseDelimitedStream(
  chunks: AsyncIterable<Uint8Array>,
  delimiter: "," | "\t",
): Promise<PassiveExtraction> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  try {
    for await (const chunk of chunks) {
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
  } catch {
    return failedPassiveExtraction(
      "delimited-passive",
      delimiter === "," ? "text/csv" : "text/tab-separated-values",
      "unreadable",
      "Delimited stream is not valid UTF-8; no repair was attempted.",
    );
  }
  return parseDelimited(new TextEncoder().encode(text), delimiter);
}

function parseRows(
  text: string,
  delimiter: string,
):
  | { readonly ok: true; readonly value: readonly (readonly string[])[] }
  | {
      readonly ok: false;
      readonly reason: string;
    } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(field);
      field = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted)
    return {
      ok: false,
      reason: "Unterminated quoted field; no repair was attempted.",
    };
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { ok: true, value: rows };
}

import {
  failedPassiveExtraction,
  type PassiveExtraction,
} from "./passive-result";
import { parsePlainText } from "./text-parser";

export function parseJson(bytes: Uint8Array): PassiveExtraction {
  const decoded = parsePlainText(bytes);
  if (decoded.status !== "success") return decoded;
  try {
    const value: unknown = JSON.parse(decoded.text);
    return Object.freeze({
      parserId: "json-passive",
      parserVersion: "1.0.0",
      status: "success",
      mediaType: "application/json",
      text: decoded.text,
      metadata: Object.freeze({
        rootType: Array.isArray(value)
          ? "array"
          : value === null
            ? "null"
            : typeof value,
      }),
      rawValues: Object.freeze([value]),
      limitations: Object.freeze([]),
      riskIndicators: Object.freeze([]),
    });
  } catch {
    return failedPassiveExtraction(
      "json-passive",
      "application/json",
      "unreadable",
      "JSON structure is invalid; no repair was attempted.",
    );
  }
}

import type { PassiveExtraction } from "../parsers/passive-result";

export function pdfRiskSummary(result: PassiveExtraction): {
  readonly blocked: boolean;
  readonly indicators: readonly string[];
} {
  return Object.freeze({
    blocked:
      result.status === "blocked" ||
      result.status === "unreadable" ||
      result.riskIndicators.length > 0,
    indicators: Object.freeze([...result.riskIndicators]),
  });
}

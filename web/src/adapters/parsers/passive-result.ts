export interface PassiveExtraction {
  readonly parserId: string;
  readonly parserVersion: string;
  readonly status:
    "success" | "partial" | "unsupported" | "unreadable" | "blocked" | "failed";
  readonly mediaType: string;
  readonly text: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  readonly rawValues: readonly unknown[];
  readonly limitations: readonly string[];
  readonly riskIndicators: readonly string[];
}

export function failedPassiveExtraction(
  parserId: string,
  mediaType: string,
  status: PassiveExtraction["status"],
  limitation: string,
): PassiveExtraction {
  return Object.freeze({
    parserId,
    parserVersion: "1.0.0",
    status,
    mediaType,
    text: "",
    metadata: Object.freeze({}),
    rawValues: Object.freeze([]),
    limitations: Object.freeze([limitation]),
    riskIndicators: Object.freeze([]),
  });
}

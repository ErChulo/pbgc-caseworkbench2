import {
  failedPassiveExtraction,
  type PassiveExtraction,
} from "./passive-result";

const decoder = new TextDecoder("utf-8", { fatal: true });

export function parsePlainText(bytes: Uint8Array): PassiveExtraction {
  try {
    const text = decoder.decode(bytes);
    return Object.freeze({
      parserId: "plain-text-passive",
      parserVersion: "1.0.0",
      status: "success",
      mediaType: "text/plain",
      text,
      metadata: Object.freeze({
        encoding: "utf-8",
        byteLength: bytes.byteLength,
      }),
      rawValues: Object.freeze(text.split(/\r?\n/u)),
      limitations: Object.freeze([]),
      riskIndicators: Object.freeze([]),
    });
  } catch {
    return failedPassiveExtraction(
      "plain-text-passive",
      "text/plain",
      "unreadable",
      "Input is not valid UTF-8; no replacement characters were invented.",
    );
  }
}

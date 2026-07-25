import {
  failedPassiveExtraction,
  type PassiveExtraction,
} from "./passive-result";

const latin = new TextDecoder("latin1");

export function parsePdfPassive(bytes: Uint8Array): PassiveExtraction {
  const source = latin.decode(bytes);
  if (!source.startsWith("%PDF-")) {
    return failedPassiveExtraction(
      "pdf-passive",
      "application/pdf",
      "unreadable",
      "PDF signature is missing.",
    );
  }
  if (/\/Encrypt\b/u.test(source)) {
    return failedPassiveExtraction(
      "pdf-passive",
      "application/pdf",
      "blocked",
      "Encrypted PDF cannot be inspected passively.",
    );
  }
  if (!/%%EOF\s*$/u.test(source)) {
    return failedPassiveExtraction(
      "pdf-passive",
      "application/pdf",
      "unreadable",
      "PDF end marker is missing; no repair was attempted.",
    );
  }
  const riskIndicators = [
    ["/JavaScript", /\/JavaScript\b|\/JS\b/u],
    ["/OpenAction", /\/OpenAction\b/u],
    ["/Launch", /\/Launch\b/u],
    ["/EmbeddedFile", /\/EmbeddedFile\b/u],
    ["/URI", /\/URI\b/u],
  ]
    .filter(([, pattern]) => (pattern as RegExp).test(source))
    .map(([name]) => name as string);
  const text = [...source.matchAll(/\(([^()]*)\)\s*Tj\b/gu)]
    .map((match) => match[1] ?? "")
    .join("\n");
  return Object.freeze({
    parserId: "pdf-passive",
    parserVersion: "1.0.0",
    status: riskIndicators.length > 0 ? "partial" : "success",
    mediaType: "application/pdf",
    text,
    metadata: Object.freeze({
      version: source.slice(5, 8),
      title: matchMetadata(source, "Title"),
      author: matchMetadata(source, "Author"),
    }),
    rawValues: Object.freeze([]),
    limitations: Object.freeze([
      "Passive PDF inspection does not execute actions or prove content safe.",
    ]),
    riskIndicators: Object.freeze(riskIndicators),
  });
}

function matchMetadata(source: string, key: string): string | null {
  return (
    new RegExp(`/${key}\\\\s*\\\\(([^)]*)\\\\)`, "u").exec(source)?.[1] ?? null
  );
}

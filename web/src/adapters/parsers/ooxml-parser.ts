import { readBoundedOoxmlParts } from "./bounded-ooxml-parts";

import {
  failedPassiveExtraction,
  type PassiveExtraction,
} from "./passive-result";
import {
  inspectOoxmlPartNames,
  inspectOoxmlRelationships,
} from "../screening/ooxml-risk";

export function parseOoxmlPassive(
  bytes: Uint8Array,
  kind: "docx" | "pptx",
): PassiveExtraction {
  try {
    const { names, xmlParts } = readBoundedOoxmlParts(bytes);
    const expectedPrefix = kind === "docx" ? "word/" : "ppt/";
    if (!names.some((name) => name.startsWith(expectedPrefix))) {
      return failedPassiveExtraction(
        "ooxml-passive",
        mediaType(kind),
        "unsupported",
        `Container does not contain the expected ${kind.toUpperCase()} structure.`,
        "1.2.0",
      );
    }
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const xmlEntries = names
      .filter(
        (name) =>
          name.toLowerCase().endsWith(".xml") ||
          name.toLowerCase().endsWith(".rels"),
      )
      .map((name) => ({
        name,
        xml: decoder.decode(xmlParts.get(name) ?? new Uint8Array()),
      }));
    // Do not resolve custom or external entities. A DTD could change text or
    // relationship interpretation; leave it for manual review instead.
    if (xmlEntries.some(({ xml }) => /<!DOCTYPE\b|<!ENTITY\b/iu.test(xml)))
      throw new Error("XML declarations with entities are unsupported.");
    const relevant = xmlEntries.filter(({ name }) =>
      kind === "docx"
        ? /^word\/(?:document|header|footer|footnotes|endnotes|comments).*\.xml$/u.test(
            name,
          )
        : /^ppt\/slides\/slide\d+\.xml$/u.test(name),
    );
    const text = relevant
      .flatMap(({ xml }) =>
        [
          ...xml.matchAll(
            kind === "docx"
              ? /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gu
              : /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gu,
          ),
        ].map((match) => decodeXml(match[1] ?? "")),
      )
      .join("\n");
    const partRisk = inspectOoxmlPartNames(names);
    const relationshipRisk = inspectOoxmlRelationships(
      xmlEntries
        .filter(({ name }) => name.toLowerCase().endsWith(".rels"))
        .map(({ xml }) => xml),
    );
    const riskIndicators = [
      ...partRisk.indicators,
      ...relationshipRisk.indicators,
    ];
    return Object.freeze({
      parserId: "ooxml-passive",
      parserVersion: "1.2.0",
      status: riskIndicators.length > 0 ? "partial" : "success",
      mediaType: mediaType(kind),
      text,
      metadata: Object.freeze({
        kind,
        partCount: names.length,
        textPartCount: relevant.length,
      }),
      rawValues: Object.freeze([]),
      limitations: Object.freeze([
        "OOXML code, links, formulas, and embedded objects were inspected structurally and never executed.",
      ]),
      riskIndicators: Object.freeze(riskIndicators),
    });
  } catch {
    return failedPassiveExtraction(
      "ooxml-passive",
      mediaType(kind),
      "unreadable",
      "OOXML package is corrupt, encrypted, unsupported, or exceeds local inspection limits; no repair was attempted.",
      "1.2.0",
    );
  }
}

function mediaType(kind: "docx" | "pptx"): string {
  return kind === "docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}

function decodeXml(value: string): string {
  const named: Readonly<Record<string, string>> = {
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&amp;": "&",
  };
  // A single pass prevents &amp;#49; from being decoded twice. Reject unknown,
  // malformed and non-XML characters rather than silently changing evidence.
  return value.replace(
    /&(?:#x[0-9a-fA-F]+|#[0-9]+|lt|gt|quot|apos|amp);|&/gu,
    (reference) => {
      if (reference === "&") throw new Error("Unsupported XML entity.");
      if (reference in named) return named[reference] ?? "";
      const hexadecimal = reference.startsWith("&#x");
      const digits = reference.slice(hexadecimal ? 3 : 2, -1);
      const point = Number.parseInt(digits, hexadecimal ? 16 : 10);
      if (
        !Number.isSafeInteger(point) ||
        !(
          point === 9 ||
          point === 10 ||
          point === 13 ||
          (point >= 0x20 && point <= 0xd7ff) ||
          (point >= 0xe000 && point <= 0xfffd) ||
          (point >= 0x10000 && point <= 0x10ffff)
        )
      )
        throw new Error("Invalid XML character reference.");
      return String.fromCodePoint(point);
    },
  );
}

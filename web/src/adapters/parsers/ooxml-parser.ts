import { strFromU8 } from "fflate";
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
        "1.1.0",
      );
    }
    const xmlEntries = names
      .filter(
        (name) =>
          name.toLowerCase().endsWith(".xml") ||
          name.toLowerCase().endsWith(".rels"),
      )
      .map((name) => ({
        name,
        xml: strFromU8(xmlParts.get(name) ?? new Uint8Array()),
      }));
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
      parserVersion: "1.1.0",
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
      "1.1.0",
    );
  }
}

function mediaType(kind: "docx" | "pptx"): string {
  return kind === "docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

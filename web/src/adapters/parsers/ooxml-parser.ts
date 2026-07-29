import { strFromU8, unzipSync } from "fflate";

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
    const parts = unzipSync(bytes);
    const names = Object.keys(parts).sort();
    const expectedPrefix = kind === "docx" ? "word/" : "ppt/";
    if (!names.some((name) => name.startsWith(expectedPrefix))) {
      return failedPassiveExtraction(
        "ooxml-passive",
        mediaType(kind),
        "unsupported",
        `Container does not contain the expected ${kind.toUpperCase()} structure.`,
      );
    }
    const xmlEntries = names
      .filter((name) => name.endsWith(".xml") || name.endsWith(".rels"))
      .map((name) => ({
        name,
        xml: strFromU8(parts[name] ?? new Uint8Array()),
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
        .filter(({ name }) => name.endsWith(".rels"))
        .map(({ xml }) => xml),
    );
    const riskIndicators = [
      ...partRisk.indicators,
      ...relationshipRisk.indicators,
    ];
    return Object.freeze({
      parserId: "ooxml-passive",
      parserVersion: "1.0.0",
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
      "OOXML package is corrupt, encrypted, or unsupported; no repair was attempted.",
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

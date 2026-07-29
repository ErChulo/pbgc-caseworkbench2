import {
  failedPassiveExtraction,
  type PassiveExtraction,
} from "./passive-result";

const latin = new TextDecoder("latin1");

export interface PdfTextSpan {
  readonly kind: "pdf-text-span";
  readonly pageNumber: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly verbatimText: string;
}

interface PdfObject {
  readonly objectNumber: number;
  readonly generationNumber: number;
  readonly body: string;
}

interface PdfObjectReference {
  readonly objectNumber: number;
  readonly generationNumber: number;
}

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
  const allTextRuns = extractTextRuns(source);
  const pageSpans = extractPageSpans(source);
  const pageMappedText = pageSpans.map((span) => span.verbatimText).join("\n");
  const pageMappingIncomplete = !sameTextRuns(
    allTextRuns,
    pageSpans.map((span) => span.verbatimText),
  );
  const text = pageMappingIncomplete ? allTextRuns.join("\n") : pageMappedText;
  const limitations = [
    "Passive PDF inspection does not execute actions or prove content safe.",
    ...(pageMappingIncomplete
      ? [
          "Some extracted PDF text could not be associated with a declared page-tree content reference.",
        ]
      : []),
  ];
  return Object.freeze({
    parserId: "pdf-passive",
    parserVersion: "1.2.0",
    status:
      riskIndicators.length > 0 || pageMappingIncomplete
        ? "partial"
        : "success",
    mediaType: "application/pdf",
    text,
    metadata: Object.freeze({
      version: source.slice(5, 8),
      title: matchMetadata(source, "Title"),
      author: matchMetadata(source, "Author"),
      pageCount: new Set(pageSpans.map((span) => span.pageNumber)).size,
    }),
    rawValues: Object.freeze(pageSpans),
    limitations: Object.freeze(limitations),
    riskIndicators: Object.freeze(riskIndicators),
  });
}

function sameTextRuns(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function extractPageSpans(source: string): readonly PdfTextSpan[] {
  const objects = parseObjects(source);
  const byReference = new Map(
    objects.map((object) => [objectKey(object), object]),
  );
  const catalog = objects.findLast((object) =>
    /\/Type\s*\/Catalog\b/u.test(object.body),
  );
  const pagesRoot =
    catalog === undefined ? null : singleReference(catalog.body, "Pages");
  if (pagesRoot === null) return [];
  const pageReferences = flattenPageTree(pagesRoot, byReference, new Set());
  const spans: PdfTextSpan[] = [];
  pageReferences.forEach((pageReference, pageIndex) => {
    const page = byReference.get(referenceKey(pageReference));
    if (page === undefined) return;
    const contentReferences = referencesForKey(page.body, "Contents");
    let pageOffset = 0;
    for (const contentReference of contentReferences) {
      const content = byReference.get(referenceKey(contentReference));
      if (content === undefined) continue;
      for (const verbatimText of extractTextRuns(content.body)) {
        const startOffset = pageOffset;
        const endOffset = startOffset + verbatimText.length;
        spans.push(
          Object.freeze({
            kind: "pdf-text-span" as const,
            pageNumber: pageIndex + 1,
            startOffset,
            endOffset,
            verbatimText,
          }),
        );
        pageOffset = endOffset + 1;
      }
    }
  });
  return spans;
}

function parseObjects(source: string): readonly PdfObject[] {
  return [
    ...source.matchAll(/(?:^|\s)(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj\b/gu),
  ].flatMap((match) => {
    const objectNumber = Number(match[1]);
    const generationNumber = Number(match[2]);
    return Number.isSafeInteger(objectNumber) &&
      Number.isSafeInteger(generationNumber)
      ? [
          {
            objectNumber,
            generationNumber,
            body: match[3] ?? "",
          },
        ]
      : [];
  });
}

function flattenPageTree(
  reference: PdfObjectReference,
  objects: ReadonlyMap<string, PdfObject>,
  visited: Set<string>,
): readonly PdfObjectReference[] {
  const key = referenceKey(reference);
  if (visited.has(key)) return [];
  visited.add(key);
  const object = objects.get(key);
  if (object === undefined) return [];
  if (/\/Type\s*\/Page\b/u.test(object.body)) return [reference];
  if (!/\/Type\s*\/Pages\b/u.test(object.body)) return [];
  return referencesForKey(object.body, "Kids").flatMap((child) =>
    flattenPageTree(child, objects, visited),
  );
}

function referencesForKey(
  body: string,
  key: string,
): readonly PdfObjectReference[] {
  const array = new RegExp(`/${key}\\s*\\[([\\s\\S]*?)\\]`, "u").exec(
    body,
  )?.[1];
  if (array !== undefined) return references(array);
  const single = singleReference(body, key);
  return single === null ? [] : [single];
}

function singleReference(body: string, key: string): PdfObjectReference | null {
  const match = new RegExp(`/${key}\\s+(\\d+)\\s+(\\d+)\\s+R\\b`, "u").exec(
    body,
  );
  return match === null ? null : parseReference(match[1], match[2]);
}

function references(value: string): readonly PdfObjectReference[] {
  return [...value.matchAll(/(\d+)\s+(\d+)\s+R\b/gu)].flatMap((match) => {
    const parsed = parseReference(match[1], match[2]);
    return parsed === null ? [] : [parsed];
  });
}

function parseReference(
  objectNumberValue: string | undefined,
  generationNumberValue: string | undefined,
): PdfObjectReference | null {
  const objectNumber = Number(objectNumberValue);
  const generationNumber = Number(generationNumberValue);
  return Number.isSafeInteger(objectNumber) &&
    Number.isSafeInteger(generationNumber)
    ? { objectNumber, generationNumber }
    : null;
}

function objectKey(object: PdfObject): string {
  return `${String(object.objectNumber)}:${String(object.generationNumber)}`;
}

function referenceKey(reference: PdfObjectReference): string {
  return `${String(reference.objectNumber)}:${String(reference.generationNumber)}`;
}

function extractTextRuns(value: string): readonly string[] {
  return [...value.matchAll(/\(([^()]*)\)\s*Tj\b/gu)].map(
    (match) => match[1] ?? "",
  );
}

function matchMetadata(source: string, key: string): string | null {
  return new RegExp(`/${key}\\s*\\(([^)]*)\\)`, "u").exec(source)?.[1] ?? null;
}

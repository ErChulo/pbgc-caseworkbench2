import { Unzip, UnzipInflate, unzipSync } from "fflate";
import { assertUniqueArchivePaths } from "./archive-path";

// Conservative resource limits for passive DOCX/PPTX review, not a complete
// ZIP or XML security validator. Reject rather than publish partial extraction.
const MAX_INPUT = 32 * 1024 * 1024;
const MAX_EXPANDED = 64 * 1024 * 1024;
const MAX_PART = 32 * 1024 * 1024;
const MAX_XML = 8 * 1024 * 1024;
const MAX_PARTS = 2_000;
const CHUNK = 4 * 1024;

interface Metadata {
  size: number;
  originalSize: number;
  compression: number;
}

export function readBoundedOoxmlParts(
  bytes: Uint8Array,
  options: {
    readonly relationshipsOnly?: boolean;
    readonly maxRelationshipBytes?: number;
  } = {},
): {
  names: readonly string[];
  xmlParts: ReadonlyMap<string, Uint8Array>;
} {
  if (bytes.byteLength > MAX_INPUT) throw new Error("Package is too large.");
  const relationshipLimit = options.maxRelationshipBytes ?? MAX_XML;
  if (
    !Number.isSafeInteger(relationshipLimit) ||
    relationshipLimit < 0 ||
    relationshipLimit > MAX_XML
  )
    throw new Error("Invalid relationship inspection limit.");
  const metadata = new Map<string, Metadata>();
  let declaredTotal = 0;
  // fflate visits the central directory without expanding data when the filter
  // always returns false. Keep duplicate entries, rather than an object map.
  unzipSync(bytes, {
    filter(part) {
      if (
        metadata.has(part.name) ||
        metadata.size >= MAX_PARTS ||
        (part.compression !== 0 && part.compression !== 8) ||
        !Number.isSafeInteger(part.size) ||
        part.size < 0 ||
        !Number.isSafeInteger(part.originalSize) ||
        part.originalSize < 0 ||
        part.originalSize > MAX_PART ||
        (part.name.toLowerCase().endsWith(".rels") &&
          part.originalSize > relationshipLimit) ||
        ((part.name.toLowerCase().endsWith(".xml") ||
          part.name.toLowerCase().endsWith(".rels")) &&
          part.originalSize > MAX_XML)
      )
        throw new Error("Package metadata is unsupported or exceeds limits.");
      declaredTotal += part.originalSize;
      if (!Number.isSafeInteger(declaredTotal) || declaredTotal > MAX_EXPANDED)
        throw new Error("Package expanded size exceeds limits.");
      metadata.set(part.name, {
        size: part.size,
        originalSize: part.originalSize,
        compression: part.compression,
      });
      return false;
    },
  });
  const names = [...metadata.keys()];
  const paths = names.map((name) =>
    name.endsWith("/") ? name.slice(0, -1) : name,
  );
  assertUniqueArchivePaths(paths);
  const folded = new Set<string>();
  for (const name of paths) {
    const key = name.normalize("NFC").replaceAll("\\", "/").toLowerCase();
    if (folded.has(key)) throw new Error("Package paths collide.");
    folded.add(key);
  }
  const xmlParts = new Map<string, Uint8Array>();
  const seen = new Set<string>();
  const completed = new Set<string>();
  let actualTotal = 0;
  const unzip = new Unzip((file) => {
    const expected = metadata.get(file.name);
    if (
      !expected ||
      seen.has(file.name) ||
      expected.compression !== file.compression ||
      (file.size !== undefined && file.size !== expected.size) ||
      (file.originalSize !== undefined &&
        file.originalSize !== expected.originalSize)
    )
      throw new Error("Local and central package entries do not match.");
    seen.add(file.name);
    const isRelationship = file.name.toLowerCase().endsWith(".rels");
    const isXml = file.name.toLowerCase().endsWith(".xml") || isRelationship;
    const capture = isRelationship || (!options.relationshipsOnly && isXml);
    const chunks: Uint8Array[] = [];
    let expanded = 0;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      expanded += chunk.byteLength;
      actualTotal += chunk.byteLength;
      if (
        expanded > expected.originalSize ||
        expanded > MAX_PART ||
        (isXml && expanded > MAX_XML) ||
        (isRelationship && expanded > relationshipLimit) ||
        actualTotal > MAX_EXPANDED
      )
        throw new Error("Package expansion exceeds limits.");
      if (capture) chunks.push(chunk);
      if (final) {
        if (expanded !== expected.originalSize)
          throw new Error("Package expanded size does not match.");
        completed.add(file.name);
        if (capture) {
          const result = new Uint8Array(expanded);
          let offset = 0;
          for (const piece of chunks) {
            result.set(piece, offset);
            offset += piece.byteLength;
          }
          xmlParts.set(file.name, result);
        }
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  // Small input chunks bound each synchronous inflate step before checking the
  // observed output size; metadata alone must never authorize expansion.
  for (let offset = 0; offset < bytes.byteLength; offset += CHUNK)
    unzip.push(
      bytes.subarray(offset, Math.min(offset + CHUNK, bytes.byteLength)),
      offset + CHUNK >= bytes.byteLength,
    );
  if (seen.size !== metadata.size || completed.size !== metadata.size)
    throw new Error("Package entries are incomplete.");
  return { names: names.sort(), xmlParts };
}

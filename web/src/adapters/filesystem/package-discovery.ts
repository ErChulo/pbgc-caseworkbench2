import type { ChunkReaderPort } from "../../domain/ports";
import type { UtcTimestamp } from "../../domain/shared/types";

export interface SubmittedFileSource {
  readonly observedRelativePath: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly lastModified: number | null;
  readonly declaredMediaType: string | null;
  open(): Promise<ChunkReaderPort<{ readonly code: string }>>;
}

export interface DiscoveredFile extends SubmittedFileSource {
  readonly normalizedDisplayPath: string;
  readonly discoveredSizeBytes: number;
  readonly discoveredLastModified: number | null;
  readonly discoveredAt: UtcTimestamp;
}

export function discoverSubmittedFiles(
  sources: readonly SubmittedFileSource[],
  discoveredAt: UtcTimestamp,
): readonly DiscoveredFile[] {
  const paths = new Set<string>();
  return Object.freeze(
    [...sources]
      .sort((left, right) =>
        left.observedRelativePath.localeCompare(right.observedRelativePath),
      )
      .map((source) => {
        const normalizedDisplayPath = normalizeSubmittedPath(
          source.observedRelativePath,
        );
        if (paths.has(normalizedDisplayPath)) {
          throw new Error(`Duplicate submitted path: ${normalizedDisplayPath}`);
        }
        paths.add(normalizedDisplayPath);
        return Object.freeze({
          ...source,
          normalizedDisplayPath,
          discoveredSizeBytes: source.sizeBytes,
          discoveredLastModified: source.lastModified,
          discoveredAt,
        });
      }),
  );
}

export function sourceRemainsUnchanged(
  discovered: DiscoveredFile,
  current: Pick<
    SubmittedFileSource,
    "sizeBytes" | "lastModified" | "observedRelativePath"
  >,
): boolean {
  return (
    discovered.observedRelativePath === current.observedRelativePath &&
    discovered.discoveredSizeBytes === current.sizeBytes &&
    discovered.discoveredLastModified === current.lastModified
  );
}

function normalizeSubmittedPath(path: string): string {
  const normalized = path.normalize("NFC").replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    normalized
      .split("/")
      .some(
        (part) =>
          part === "" ||
          part === "." ||
          part === ".." ||
          hasControlCharacter(part),
      )
  ) {
    throw new Error("Submitted path is unsafe.");
  }
  return normalized;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

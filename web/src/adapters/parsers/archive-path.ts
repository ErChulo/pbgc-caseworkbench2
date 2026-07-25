export interface ArchivePathResult {
  readonly observedPath: string;
  readonly normalizedDisplayPath: string;
}

export function canonicalizeArchivePath(path: string): ArchivePathResult {
  const normalized = path.normalize("NFC").replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    parts.some(
      (part) =>
        part === "" ||
        part === "." ||
        part === ".." ||
        hasControlCharacter(part),
    )
  ) {
    throw new Error("Archive member path is unsafe.");
  }
  return Object.freeze({
    observedPath: path,
    normalizedDisplayPath: normalized,
  });
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function assertUniqueArchivePaths(
  paths: readonly string[],
): readonly ArchivePathResult[] {
  const seen = new Set<string>();
  return Object.freeze(
    paths.map((path) => {
      const result = canonicalizeArchivePath(path);
      if (seen.has(result.normalizedDisplayPath))
        throw new Error("Archive member paths collide.");
      seen.add(result.normalizedDisplayPath);
      return result;
    }),
  );
}

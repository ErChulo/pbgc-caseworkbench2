export function normalizeWorkspacePath(value: string): string | null {
  const normalized = value.trim().replaceAll("\\", "/");
  if (normalized === "" || normalized.startsWith("/")) return null;
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    return null;
  }
  return normalized;
}

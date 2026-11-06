export interface OoxmlRisk {
  readonly blocked: boolean;
  readonly indicators: readonly string[];
}

export function inspectOoxmlPartNames(names: readonly string[]): OoxmlRisk {
  const indicators = names
    .flatMap((name) => {
      const normalized = name.toLowerCase();
      if (normalized.endsWith("vbaproject.bin")) return [`macro:${name}`];
      if (normalized.includes("/embeddings/"))
        return [`embedded-object:${name}`];
      if (normalized.includes("externallinks"))
        return [`external-link:${name}`];
      if (
        normalized.endsWith("/connections.xml") ||
        normalized.includes("/querytables/")
      )
        return [`external-data-connection:${name}`];
      return [];
    })
    .sort();
  return Object.freeze({
    blocked: indicators.length > 0,
    indicators: Object.freeze(indicators),
  });
}

export function inspectOoxmlRelationships(
  xmlParts: readonly string[],
): OoxmlRisk {
  const indicators = xmlParts.flatMap((xml, index) => {
    const matches = [...xml.matchAll(/\bTargetMode\s*=\s*(["'])(.*?)\1/giu)];
    const occurrences = [...xml.matchAll(/\bTargetMode\b/giu)].length;
    if (matches.some((match) => (match[2] ?? "").toLowerCase() === "external"))
      return [`external-relationship:part-${String(index)}`];
    if (
      /<!DOCTYPE|<!ENTITY/iu.test(xml) ||
      occurrences !== matches.length ||
      matches.some((match) => (match[2] ?? "").toLowerCase() !== "internal")
    )
      return [`unverified-relationship:part-${String(index)}`];
    return [];
  });
  return Object.freeze({
    blocked: indicators.length > 0,
    indicators: Object.freeze(indicators),
  });
}

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
  const indicators = xmlParts.flatMap((xml, index) =>
    /TargetMode\s*=\s*["']External["']/iu.test(xml)
      ? [`external-relationship:part-${String(index)}`]
      : [],
  );
  return Object.freeze({
    blocked: indicators.length > 0,
    indicators: Object.freeze(indicators),
  });
}

import type { V1Architecture } from "../architecture/models";
import type { NamedRangeDefinition } from "./models";
import { compareCodePoint } from "./identity";

export function generateNamedRanges(config: {
  readonly architecture: V1Architecture;
}): readonly NamedRangeDefinition[] {
  return config.architecture.namedRanges
    .map((range) => ({
      rangeName: range.name,
      cellAddress: range.cellAddress,
      tabName: range.sourceTab,
      scope: range.scope,
      genericField: range.genericField,
      scenarioId: null,
      provenance: {
        source: "architecture" as const,
        architectureNamedRange: range.name,
      },
    }))
    .sort((a, b) =>
      compareCodePoint(
        `${a.scope}\u0000${a.tabName}\u0000${a.rangeName}`,
        `${b.scope}\u0000${b.tabName}\u0000${b.rangeName}`,
      ),
    );
}

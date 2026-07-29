import type { FormulaNode } from "../formula-compiler/models";
import { parseFormula } from "../formula-compiler/parser";
import { excelScalarV1Policy } from "../formula-compiler/policy";
import {
  isValidName,
  normalizeCellAddress,
  normalizeCellRange,
  referenceKey,
} from "../formula-compiler/reference-codec";
import type { CreateUnresolvedItemInput } from "../plan-rules/unresolved-items";
import type { Result, Uuid } from "../shared/types";
import type {
  ArchitectureBuildError,
  CellDescriptor,
  FormulaDependency,
  NamedRange,
} from "./models";

export type FormulaReference =
  | {
      readonly kind: "cell" | "range";
      readonly sheetName: string;
      readonly address: string;
      readonly originalText: string;
    }
  | {
      readonly kind: "named-range";
      readonly sheetName: string | null;
      readonly name: string;
      readonly originalText: string;
    }
  | { readonly kind: "external"; readonly originalText: string };

export type FormulaReferenceExtraction = Result<
  readonly FormulaReference[],
  Extract<ArchitectureBuildError, { readonly code: "DEPENDENCY_UNRESOLVED" }>
>;

export interface ComputeDependenciesInput {
  readonly cells: ReadonlyMap<string, CellDescriptor>;
  readonly scenarios: readonly (string | { readonly runId: string })[];
  readonly namedRanges?: readonly NamedRange[];
}

const interpretationId = (suffix: string) =>
  `00000000-0000-4000-8000-${suffix.padStart(12, "0")}` as Uuid;

function missingSequencing(
  scope: string,
  detail: string,
): CreateUnresolvedItemInput {
  return {
    kind: "missing-sequencing",
    affectedScope: scope,
    competingInterpretations: [
      {
        interpretationId: interpretationId("401"),
        statement:
          "The reference must be resolved before dependency sequencing.",
        evidence: [],
        sourceCandidateId: null,
      },
      {
        interpretationId: interpretationId("402"),
        statement:
          "The affected formula must be excluded from the architecture.",
        evidence: [],
        sourceCandidateId: null,
      },
    ],
    consequence: detail,
    reviewer: null,
  };
}

function visitReferences(
  source: string,
  currentTab: string,
  node: FormulaNode,
  references: FormulaReference[],
): void {
  if (node.kind === "unary") {
    visitReferences(source, currentTab, node.operand, references);
    return;
  }
  if (node.kind === "binary") {
    visitReferences(source, currentTab, node.left, references);
    visitReferences(source, currentTab, node.right, references);
    return;
  }
  if (node.kind === "call") {
    node.arguments.forEach((argument) => {
      visitReferences(source, currentTab, argument, references);
    });
    return;
  }
  if (node.kind !== "reference") return;
  const originalText = source.slice(node.span.startOffset, node.span.endOffset);
  if (node.name.startsWith("[") || node.sheetName?.startsWith("[")) {
    references.push({ kind: "external", originalText });
    return;
  }
  const sheetName = node.sheetName ?? currentTab;
  const cell = normalizeCellAddress(node.name);
  if (cell !== null) {
    references.push({ kind: "cell", sheetName, address: cell, originalText });
    return;
  }
  const range = normalizeCellRange(node.name);
  if (range !== null) {
    references.push({
      kind: "range",
      sheetName,
      address: `${range.startAddress}:${range.endAddress}`,
      originalText,
    });
    return;
  }
  references.push({
    kind: "named-range",
    sheetName: node.sheetName,
    name: node.name,
    originalText,
  });
}

export function extractFormulaRefs(
  formulaText: string,
  currentTab: string,
): FormulaReferenceExtraction {
  const parsed = parseFormula(formulaText, excelScalarV1Policy);
  if (!parsed.ok) {
    const details = parsed.issues
      .map((issue) => issue.code)
      .sort()
      .join(", ");
    return {
      ok: false,
      error: {
        code: "DEPENDENCY_UNRESOLVED",
        message: `Formula reference parsing failed: ${details}`,
        unresolvedItems: [
          missingSequencing(
            currentTab,
            `Formula dependency sequencing is blocked by parse issue(s): ${details}.`,
          ),
        ],
        partialDependencies: [],
      },
    };
  }
  const references: FormulaReference[] = [];
  visitReferences(formulaText, currentTab, parsed.ast, references);
  return {
    ok: true,
    value: references.sort((left, right) =>
      left.originalText.localeCompare(right.originalText),
    ),
  };
}

export function resolveNamedRange(
  name: string,
  namedRanges: readonly NamedRange[],
  currentTab?: string,
): NamedRange | null {
  const normalized = name.toUpperCase();
  const matches = namedRanges
    .filter(
      (range) =>
        range.name.toUpperCase() === normalized &&
        (range.scope === "workbook" ||
          range.sourceTab.toUpperCase() === currentTab?.toUpperCase()),
    )
    .sort((left, right) => {
      const leftPriority =
        currentTab !== undefined &&
        left.scope === "sheet" &&
        left.sourceTab.toUpperCase() === currentTab.toUpperCase()
          ? 0
          : 1;
      const rightPriority =
        currentTab !== undefined &&
        right.scope === "sheet" &&
        right.sourceTab.toUpperCase() === currentTab.toUpperCase()
          ? 0
          : 1;
      return leftPriority - rightPriority;
    });
  if (matches.length === 0) return null;
  const priority = matches[0]?.scope === "sheet" ? "sheet" : "workbook";
  return matches.filter((range) => range.scope === priority).length === 1
    ? (matches[0] ?? null)
    : null;
}

function addressCoordinates(address: string): readonly [number, number] | null {
  const normalized = normalizeCellAddress(address)?.replaceAll("$", "");
  const match = /^([A-Z]+)([0-9]+)$/u.exec(normalized ?? "");
  if (!match?.[1] || !match[2]) return null;
  let column = 0;
  for (const character of match[1])
    column = column * 26 + character.charCodeAt(0) - 64;
  return [column, Number(match[2])];
}

function cellsInRange(
  sourceTab: string,
  address: string,
  cells: readonly CellDescriptor[],
): readonly CellDescriptor[] {
  const range = normalizeCellRange(address);
  if (range === null) return [];
  const start = addressCoordinates(range.startAddress);
  const end = addressCoordinates(range.endAddress);
  if (start === null || end === null) return [];
  const minColumn = Math.min(start[0], end[0]);
  const maxColumn = Math.max(start[0], end[0]);
  const minRow = Math.min(start[1], end[1]);
  const maxRow = Math.max(start[1], end[1]);
  return cells.filter((cell) => {
    if (cell.sourceTab.toUpperCase() !== sourceTab.toUpperCase()) return false;
    const coordinates = addressCoordinates(cell.cellAddress);
    return (
      coordinates !== null &&
      coordinates[0] >= minColumn &&
      coordinates[0] <= maxColumn &&
      coordinates[1] >= minRow &&
      coordinates[1] <= maxRow
    );
  });
}

const edgeKey = (edge: FormulaDependency) =>
  `${edge.runId}\u0000${edge.dependentKey}\u0000${edge.dependencyKey}\u0000${edge.referenceType}`;

export function computeDependencies(
  input: ComputeDependenciesInput,
): Result<readonly FormulaDependency[], ArchitectureBuildError> {
  const cells = [...input.cells.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  const cellIndex = new Map(
    cells.flatMap((cell) => {
      const address = normalizeCellAddress(cell.cellAddress);
      return address === null
        ? []
        : [
            [
              referenceKey(cell.sourceTab, address.replaceAll("$", "")),
              cell,
            ] as const,
          ];
    }),
  );
  const runs = input.scenarios
    .map((scenario) =>
      typeof scenario === "string" ? scenario : scenario.runId,
    )
    .sort();
  const edges = new Map<string, FormulaDependency>();
  const unresolved: CreateUnresolvedItemInput[] = [];

  for (const cell of cells) {
    if (!cell.hasFormula || cell.formulaText === null) continue;
    const extracted = extractFormulaRefs(cell.formulaText, cell.sourceTab);
    if (!extracted.ok) {
      unresolved.push(...extracted.error.unresolvedItems);
      continue;
    }
    for (const reference of extracted.value) {
      if (reference.kind === "external") {
        for (const runId of runs) {
          const edge: FormulaDependency = {
            dependentKey: cell.key,
            dependencyKey: reference.originalText,
            runId,
            referenceType: "external",
          };
          edges.set(edgeKey(edge), edge);
        }
        unresolved.push(
          missingSequencing(
            cell.key,
            `External formula reference ${reference.originalText} cannot be sequenced within this architecture.`,
          ),
        );
        continue;
      }

      let targets: readonly CellDescriptor[] = [];
      let referenceType: FormulaDependency["referenceType"] = "cell";
      if (reference.kind === "named-range") {
        const range = isValidName(reference.name)
          ? resolveNamedRange(
              reference.name,
              input.namedRanges ?? [],
              reference.sheetName ?? cell.sourceTab,
            )
          : null;
        if (range !== null) {
          referenceType = "named-range";
          const normalizedAddress = normalizeCellAddress(range.cellAddress);
          targets =
            normalizedAddress === null
              ? cellsInRange(range.sourceTab, range.cellAddress, cells)
              : [
                  cellIndex.get(
                    referenceKey(
                      range.sourceTab,
                      normalizedAddress.replaceAll("$", ""),
                    ),
                  ),
                ].filter(
                  (target): target is CellDescriptor => target !== undefined,
                );
        }
      } else if (reference.kind === "range") {
        targets = cellsInRange(reference.sheetName, reference.address, cells);
      } else {
        const address = normalizeCellAddress(reference.address)?.replaceAll(
          "$",
          "",
        );
        const target =
          address === undefined
            ? undefined
            : cellIndex.get(referenceKey(reference.sheetName, address));
        targets = target === undefined ? [] : [target];
      }

      if (targets.length === 0) {
        unresolved.push(
          missingSequencing(
            cell.key,
            `Formula reference ${reference.originalText} does not resolve to an architecture cell or range.`,
          ),
        );
        continue;
      }
      for (const runId of runs)
        for (const target of targets) {
          const edge: FormulaDependency = {
            dependentKey: cell.key,
            dependencyKey: target.key,
            runId,
            referenceType,
          };
          edges.set(edgeKey(edge), edge);
        }
    }
  }

  const dependencies = [...edges.values()].sort((left, right) =>
    edgeKey(left).localeCompare(edgeKey(right)),
  );
  if (unresolved.length > 0)
    return {
      ok: false,
      error: {
        code: "DEPENDENCY_UNRESOLVED",
        message:
          "Formula dependencies contain unresolved or external references.",
        unresolvedItems: unresolved.sort((left, right) =>
          `${left.affectedScope}\u0000${left.consequence}`.localeCompare(
            `${right.affectedScope}\u0000${right.consequence}`,
          ),
        ),
        partialDependencies: dependencies,
      },
    };

  const cycleItems = detectCycles(dependencies);
  return cycleItems.length === 0
    ? { ok: true, value: dependencies }
    : {
        ok: false,
        error: {
          code: "CIRCULAR_DEPENDENCY",
          message: "Circular formula dependencies block sequencing.",
          unresolvedItems: cycleItems,
          partialDependencies: dependencies,
        },
      };
}

export function detectCycles(
  dependencies: readonly FormulaDependency[],
): readonly CreateUnresolvedItemInput[] {
  const items: CreateUnresolvedItemInput[] = [];
  const runs = [...new Set(dependencies.map((edge) => edge.runId))].sort();
  for (const runId of runs) {
    const adjacency = new Map<string, string[]>();
    for (const edge of dependencies
      .filter((candidate) => candidate.runId === runId)
      .sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)))) {
      const values = adjacency.get(edge.dependentKey) ?? [];
      values.push(edge.dependencyKey);
      adjacency.set(edge.dependentKey, [...new Set(values)].sort());
    }
    const visited = new Set<string>();
    const active = new Set<string>();
    const stack: string[] = [];
    const cycles = new Set<string>();
    const visit = (node: string): void => {
      if (active.has(node)) {
        const start = stack.indexOf(node);
        cycles.add(stack.slice(start).sort().join(" -> "));
        return;
      }
      if (visited.has(node)) return;
      active.add(node);
      stack.push(node);
      for (const dependency of adjacency.get(node) ?? []) visit(dependency);
      stack.pop();
      active.delete(node);
      visited.add(node);
    };
    [...adjacency.keys()].sort().forEach(visit);
    for (const cycle of [...cycles].sort())
      items.push(
        missingSequencing(
          `run ${runId}: ${cycle}`,
          `Circular formula dependencies prevent a deterministic sequence for run ${runId}.`,
        ),
      );
  }
  return items;
}

export function detectCircularDependencies(
  _cells: ReadonlyMap<string, CellDescriptor>,
  dependencies: readonly FormulaDependency[],
): readonly string[] {
  return detectCycles(dependencies).map((item) => item.affectedScope);
}

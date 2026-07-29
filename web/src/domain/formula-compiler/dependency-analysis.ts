import type { DiagnosticDraft } from "./models";

export interface DependencyCandidate {
  readonly formulaId: string;
  readonly dependencies: readonly string[];
}
export interface DependencyAnalysis {
  readonly executionOrder: readonly string[];
  readonly cycleIds: ReadonlySet<string>;
  readonly cycleMembers: ReadonlyMap<string, readonly string[]>;
  readonly dependencyBlocked: ReadonlyMap<string, readonly string[]>;
  readonly issues: readonly DiagnosticDraft[];
}

export function analyzeDependencies(
  candidates: readonly DependencyCandidate[],
  failedIds: ReadonlySet<string>,
): DependencyAnalysis {
  const ids = new Set(candidates.map((candidate) => candidate.formulaId));
  const dependencyMap = new Map(
    candidates.map((candidate) => [
      candidate.formulaId,
      candidate.dependencies.filter((dependency) => ids.has(dependency)).sort(),
    ]),
  );
  const cycleIds = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      stack.slice(start).forEach((value) => cycleIds.add(value));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    stack.push(id);
    for (const dependency of dependencyMap.get(id) ?? []) visit(dependency);
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  [...ids].sort().forEach(visit);
  const reachable = (
    from: string,
    target: string,
    seen = new Set<string>(),
  ): boolean => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (dependencyMap.get(from) ?? []).some((next) =>
      reachable(next, target, seen),
    );
  };
  const cycleMembers = new Map<string, readonly string[]>();
  for (const id of cycleIds)
    cycleMembers.set(
      id,
      [...cycleIds]
        .filter(
          (candidate) => reachable(id, candidate) && reachable(candidate, id),
        )
        .sort(),
    );
  const dependencyBlocked = new Map<string, readonly string[]>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...ids].sort()) {
      if (failedIds.has(id) || cycleIds.has(id) || dependencyBlocked.has(id))
        continue;
      const causes = new Set<string>();
      for (const dependency of dependencyMap.get(id) ?? []) {
        if (failedIds.has(dependency)) causes.add(dependency);
        else if (cycleIds.has(dependency))
          for (const member of cycleMembers.get(dependency) ?? [dependency])
            causes.add(member);
        else
          for (const rootCause of dependencyBlocked.get(dependency) ?? [])
            causes.add(rootCause);
      }
      if (causes.size > 0) {
        dependencyBlocked.set(id, [...causes].sort());
        changed = true;
      }
    }
  }
  const usable = [...ids].filter(
    (id) =>
      !failedIds.has(id) && !cycleIds.has(id) && !dependencyBlocked.has(id),
  );
  const indegree = new Map(usable.map((id) => [id, 0]));
  const dependents = new Map(usable.map((id) => [id, [] as string[]]));
  for (const id of usable)
    for (const dependency of dependencyMap.get(id) ?? [])
      if (indegree.has(dependency)) {
        indegree.set(id, (indegree.get(id) ?? 0) + 1);
        const downstream = dependents.get(dependency);
        if (downstream) downstream.push(id);
      }
  const queue = usable.filter((id) => indegree.get(id) === 0).sort();
  const executionOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    executionOrder.push(id);
    for (const dependent of (dependents.get(id) ?? []).sort()) {
      const next = (indegree.get(dependent) ?? 1) - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        queue.push(dependent);
        queue.sort();
      }
    }
  }
  const issues: DiagnosticDraft[] = [
    ...[...cycleIds].sort().map((formulaId): DiagnosticDraft => ({
      code: "DEPENDENCY_CYCLE",
      category: "dependency",
      severity: "error",
      blocksDownstream: true,
      formulaId,
      scenarioId: null,
      sourceSpan: null,
      message: `Formula ${formulaId} participates in a dependency cycle.`,
      context: { formulaId },
    })),
    ...[...dependencyBlocked].map(([formulaId, causes]): DiagnosticDraft => ({
      code: "DEPENDENCY_FAILED",
      category: "dependency",
      severity: "error",
      blocksDownstream: true,
      formulaId,
      scenarioId: null,
      sourceSpan: null,
      message: `Formula ${formulaId} depends on a blocked formula.`,
      context: { causalFormulaIds: causes.join(",") },
    })),
  ];
  return { executionOrder, cycleIds, cycleMembers, dependencyBlocked, issues };
}

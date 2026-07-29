import type { ExecutionOrder, FormulaDefinitionV2 } from "./models";
import { compareCodePoint } from "./identity";

export function computeExecutionOrder(config: {
  readonly formulas: readonly FormulaDefinitionV2[];
}): ExecutionOrder {
  const formulas = [...config.formulas].sort((a, b) =>
    compareCodePoint(a.formulaId, b.formulaId),
  );
  const ids = new Set(formulas.map((formula) => formula.formulaId));
  const dependents = new Map(
    formulas.map((formula) => [formula.formulaId, new Set<string>()]),
  );
  const inDegree = new Map(formulas.map((formula) => [formula.formulaId, 0]));
  for (const formula of formulas)
    for (const dependency of [...new Set(formula.dependencies)].sort(
      compareCodePoint,
    )) {
      if (!ids.has(dependency)) continue;
      dependents.get(dependency)?.add(formula.formulaId);
      inDegree.set(
        formula.formulaId,
        (inDegree.get(formula.formulaId) ?? 0) + 1,
      );
    }
  const queue = [...inDegree]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort(compareCodePoint);
  const order: string[] = [];
  const depths = new Map<string, number>();
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    order.push(id);
    const formula = formulas.find((item) => item.formulaId === id);
    depths.set(
      id,
      formula
        ? Math.max(
            0,
            ...formula.dependencies.map(
              (dependency) => (depths.get(dependency) ?? -1) + 1,
            ),
          )
        : 0,
    );
    for (const dependent of [...(dependents.get(id) ?? [])].sort(
      compareCodePoint,
    )) {
      const degree = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, degree);
      if (degree === 0) {
        queue.push(dependent);
        queue.sort(compareCodePoint);
      }
    }
  }
  const dependencies = new Map(
    formulas.map((formula) => [
      formula.formulaId,
      [...new Set(formula.dependencies)]
        .filter((dependency) => ids.has(dependency))
        .sort(compareCodePoint),
    ]),
  );
  const cycleNodes = stronglyConnectedComponents(
    formulas.map((formula) => formula.formulaId),
    dependencies,
  )
    .filter(
      (component) =>
        component.length > 1 ||
        (component[0] !== undefined &&
          dependencies.get(component[0])?.includes(component[0])),
    )
    .flat()
    .sort(compareCodePoint);
  const maxDepth = depths.size === 0 ? 0 : Math.max(...depths.values());
  return {
    order,
    levelCount: order.length === 0 ? 0 : maxDepth + 1,
    maxDepth,
    hasCycles: cycleNodes.length > 0,
    cycleNodes,
  };
}

function stronglyConnectedComponents(
  ids: readonly string[],
  dependencies: ReadonlyMap<string, readonly string[]>,
): readonly (readonly string[])[] {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (id: string): void => {
    const index = nextIndex++;
    indices.set(id, index);
    lowLinks.set(id, index);
    stack.push(id);
    onStack.add(id);
    for (const dependency of dependencies.get(id) ?? []) {
      if (!indices.has(dependency)) {
        visit(dependency);
        lowLinks.set(
          id,
          Math.min(
            lowLinks.get(id) ?? index,
            lowLinks.get(dependency) ?? index,
          ),
        );
      } else if (onStack.has(dependency)) {
        lowLinks.set(
          id,
          Math.min(lowLinks.get(id) ?? index, indices.get(dependency) ?? index),
        );
      }
    }
    if (lowLinks.get(id) !== indices.get(id)) return;
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      component.push(member);
    } while (member !== id);
    components.push(component.sort(compareCodePoint));
  };

  for (const id of ids) if (!indices.has(id)) visit(id);
  return components;
}

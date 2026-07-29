import type {
  AcquisitionLineageNode,
  PromotedFact,
} from "../acquisition/models";
import type { Sha256 } from "../shared/types";

export interface LineageEdge {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly relationship:
    | "request-to-package"
    | "package-to-proposal"
    | "proposal-to-decision"
    | "decision-to-promoted-fact"
    | "rerun-trigger";
}

export class LineageGraph {
  private readonly nodes = new Map<string, AcquisitionLineageNode>();
  private readonly edges = new Map<string, LineageEdge>();

  addNode(node: AcquisitionLineageNode): void {
    if (this.nodes.has(node.nodeId))
      throw new TypeError("Duplicate lineage node.");
    this.nodes.set(node.nodeId, node);
  }
  addEdge(edge: LineageEdge): void {
    if (this.edges.has(edge.edgeId))
      throw new TypeError("Duplicate lineage edge.");
    if (!this.nodes.has(edge.fromNodeId) || !this.nodes.has(edge.toNodeId))
      throw new TypeError("Lineage edge endpoint is orphaned.");
    this.edges.set(edge.edgeId, edge);
  }
  trace(nodeId: string, maximumNodes = 100): readonly AcquisitionLineageNode[] {
    if (!this.nodes.has(nodeId)) return [];
    const visited = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0 && visited.size < maximumNodes) {
      const current = queue.shift();
      if (current === undefined || visited.has(current)) continue;
      visited.add(current);
      for (const edge of this.edges.values()) {
        if (edge.fromNodeId === current) queue.push(edge.toNodeId);
        if (edge.toNodeId === current) queue.push(edge.fromNodeId);
      }
    }
    return [...visited]
      .map((id) => this.nodes.get(id))
      .filter((node): node is AcquisitionLineageNode => node !== undefined);
  }
  assertPath(types: readonly AcquisitionLineageNode["nodeType"][]): void {
    for (let index = 1; index < types.length; index += 1) {
      const from = [...this.nodes.values()].filter(
        (node) => node.nodeType === types[index - 1],
      );
      const to = new Set(
        [...this.nodes.values()]
          .filter((node) => node.nodeType === types[index])
          .map((node) => node.nodeId),
      );
      if (
        ![...this.edges.values()].some(
          (edge) =>
            from.some((node) => node.nodeId === edge.fromNodeId) &&
            to.has(edge.toNodeId),
        )
      )
        throw new TypeError("Required lineage path is incomplete.");
    }
  }
}

export function assertPromotionsUnique(
  promotions: readonly PromotedFact[],
): void {
  const targets = promotions.map(
    (item) =>
      `${item.sourceProposalSha256}:${item.factJsonPointer}:${item.targetGovernedRecordType}:${item.targetGovernedRecordId}`,
  );
  if (new Set(targets).size !== targets.length)
    throw new TypeError("Conflicting duplicate fact promotion.");
}

export function assertExactArtifactLineage(
  node: AcquisitionLineageNode,
  required: readonly Sha256[],
): void {
  if (
    required.some((hash) => !node.artifactSha256Values.includes(hash)) ||
    node.artifactSha256Values.some((hash) => !required.includes(hash))
  )
    throw new TypeError("Lineage artifact hashes do not match exactly.");
}

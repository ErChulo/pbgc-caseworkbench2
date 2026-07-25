import { describe, expect, it } from "vitest";

import {
  LineageGraph,
  assertExactArtifactLineage,
} from "../../../../src/domain/lineage/lineage-graph";
import { parseSha256, type Sha256 } from "../../../../src/domain/shared/types";

const hash = sha("a".repeat(64));
const node = (
  nodeId: string,
  nodeType: "request" | "package" | "proposal" | "decision" | "promoted-fact",
) => ({
  nodeId,
  nodeType,
  contentSha256: hash,
  artifactSha256Values: [hash],
  requestingModuleId: "synthetic-module",
});

describe("T104 lineage graph", () => {
  it("traces request through promoted fact", () => {
    const graph = new LineageGraph();
    const types = [
      "request",
      "package",
      "proposal",
      "decision",
      "promoted-fact",
    ] as const;
    types.forEach((type, index) => {
      graph.addNode(node(String(index), type));
    });
    for (let index = 1; index < types.length; index += 1)
      graph.addEdge({
        edgeId: `e${String(index)}`,
        fromNodeId: String(index - 1),
        toNodeId: String(index),
        relationship: [
          "request-to-package",
          "package-to-proposal",
          "proposal-to-decision",
          "decision-to-promoted-fact",
        ][index - 1] as "request-to-package",
      });
    graph.assertPath(types);
    expect(graph.trace("0")).toHaveLength(5);
    assertExactArtifactLineage(node("x", "proposal"), [hash]);
  });
  it("rejects duplicate nodes and orphan edges", () => {
    const graph = new LineageGraph();
    graph.addNode(node("1", "request"));
    expect(() => {
      graph.addNode(node("1", "request"));
    }).toThrow();
    expect(() => {
      graph.addEdge({
        edgeId: "e",
        fromNodeId: "1",
        toNodeId: "missing",
        relationship: "request-to-package",
      });
    }).toThrow();
  });
});

function sha(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new Error("sha");
  return parsed.value;
}

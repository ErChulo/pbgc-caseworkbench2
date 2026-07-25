export interface LineageDisplayNode {
  readonly nodeId: string;
  readonly label: string;
  readonly sourceHash: string;
  readonly sourceLocator: string;
  readonly status: string;
}

export function LineageExplorer({
  nodes,
}: {
  readonly nodes: readonly LineageDisplayNode[];
}) {
  return (
    <section aria-labelledby="lineage-title">
      <h3 id="lineage-title">One-view lineage</h3>
      <p>
        Each entry links a normalized or governed record to exact local source
        bytes, locator, and review state.
      </p>
      <ul className="review-list">
        {nodes.map((node) => (
          <li key={node.nodeId}>
            <strong>{node.label}</strong>
            <dl>
              <div>
                <dt>Source SHA-256</dt>
                <dd>{node.sourceHash}</dd>
              </div>
              <div>
                <dt>Source locator</dt>
                <dd>{node.sourceLocator}</dd>
              </div>
              <div>
                <dt>Governed status</dt>
                <dd>{node.status}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
      <h3 id="lineage-title">File-to-decision trace</h3>
      <p>
        Each entry links a record to its exact source file, location, and
        current status.
      </p>
      <ul className="review-list">
        {nodes.map((node) => (
          <li key={node.nodeId}>
            <strong>{node.label}</strong>
            <dl>
              <div>
                <dt>Content fingerprint</dt>
                <dd>{node.sourceHash}</dd>
              </div>
              <div>
                <dt>Source location</dt>
                <dd>{node.sourceLocator}</dd>
              </div>
              <div>
                <dt>Current status</dt>
                <dd>{node.status}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

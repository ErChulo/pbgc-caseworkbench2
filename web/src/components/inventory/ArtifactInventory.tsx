export interface ArtifactInventoryItem {
  readonly id: string;
  readonly path: string;
  readonly sizeBytes: number;
  readonly sha256: string | null;
  readonly status:
    "queued" | "hashing" | "preserved" | "duplicate" | "failed" | "interrupted";
  readonly message: string;
}

export function ArtifactInventory({
  items,
}: {
  readonly items: readonly ArtifactInventoryItem[];
}) {
  if (items.length === 0) {
    return <p className="inventory-empty">No artifacts selected.</p>;
  }
  return (
    <div className="inventory-table-wrap">
      <table className="inventory-table">
        <caption>Provisional artifact inventory</caption>
        <thead>
          <tr>
            <th scope="col">Submitted path</th>
            <th scope="col">Bytes</th>
            <th scope="col">Status</th>
            <th scope="col">SHA-256</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.path}</strong>
                <span>{item.message}</span>
              </td>
              <td>{item.sizeBytes.toLocaleString("en-US")}</td>
              <td>
                <span
                  className={`inventory-status inventory-status-${item.status}`}
                >
                  {item.status}
                </span>
              </td>
              <td>
                <code>{item.sha256 ?? "Pending"}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface ArtifactInventoryItem {
  readonly id: string;
  readonly path: string;
  readonly sizeBytes: number;
  readonly sha256: string | null;
  readonly status:
    | "queued"
    | "hashing"
    | "preserved"
    | "duplicate"
    | "provisional-blocked"
    | "failed"
    | "interrupted";
  readonly message: string;
}

export function ArtifactInventory({
  items,
  onOpen,
}: {
  readonly items: readonly ArtifactInventoryItem[];
  readonly onOpen?: (item: ArtifactInventoryItem) => Promise<void>;
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
            {onOpen !== undefined ? <th scope="col">Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td data-label="Submitted path">
                <strong>{item.path}</strong>
                <span>{item.message}</span>
              </td>
              <td data-label="Bytes">
                {item.sizeBytes.toLocaleString("en-US")}
              </td>
              <td data-label="Status">
                <span
                  className={`inventory-status inventory-status-${item.status}`}
                >
                  {item.status}
                </span>
              </td>
              <td data-label="SHA-256">
                <code>{item.sha256 ?? "Pending"}</code>
              </td>
              {onOpen !== undefined ? (
                <td data-label="Action">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    disabled={
                      item.sha256 === null ||
                      item.status === "failed" ||
                      item.status === "interrupted"
                    }
                    onClick={() => void onOpen(item)}
                  >
                    Open evidence
                    <span className="visually-hidden">: {item.path}</span>
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

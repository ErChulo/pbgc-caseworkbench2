import { useRef, useState } from "react";
import { parseApprovedDataDictionary } from "../../adapters/parsers/data-dictionary-parser";
import {
  APPROVED_DATA_DICTIONARY_BYTE_SIZE,
  type OfficialFieldCatalogIndex,
  type OfficialFieldRecord,
} from "../../domain/field-catalog/models";

export function OfficialFieldCatalogPanel() {
  const [catalog, setCatalog] = useState<OfficialFieldCatalogIndex | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [tableName, setTableName] = useState("");
  const sequence = useRef(0);
  const load = async (file: File | undefined) => {
    if (file === undefined) return;
    const request = ++sequence.current;
    setCatalog(null);
    setMessage(null);
    setLoading(true);
    try {
      if (file.size !== APPROVED_DATA_DICTIONARY_BYTE_SIZE)
        throw new Error(
          "This file does not have the approved Data Dictionary size.",
        );
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (request !== sequence.current) return;
      const result = await parseApprovedDataDictionary(bytes);
      if (request !== sequence.current) return;
      if (!result.ok) throw new Error(result.error.safeMessage);
      setCatalog(result.value);
      setMessage(
        `Approved Data Dictionary verified locally: ${String(result.value.records.length)} field records. No macros were executed.`,
      );
    } catch (error) {
      if (request === sequence.current)
        setMessage(
          error instanceof Error
            ? error.message
            : "Data Dictionary could not be verified.",
        );
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  };
  const field = fieldName.trim();
  const table = tableName.trim();
  const lookup =
    catalog !== null && field !== "" ? catalog.lookupFieldName(field) : null;
  const matched: readonly OfficialFieldRecord[] =
    lookup === null || lookup.status === "not-found"
      ? []
      : lookup.status === "unique"
        ? [lookup.record]
        : lookup.records;
  const visible =
    table === ""
      ? matched
      : matched.filter((item) => item.identity.tableName === table);
  return (
    <section
      className="case-panel"
      aria-labelledby="official-field-catalog-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Local reference</p>
          <h2 id="official-field-catalog-title">
            Approved Data Dictionary lookup
          </h2>
        </div>
        <span className="status-chip">Reference only</span>
      </div>
      <p>
        Select the approved local Data Dictionary workbook. The application
        checks its exact size and SHA-256 and reads it without executing macros.
        It stays in this browser session and is not added to the case.
      </p>
      <label className="file-picker">
        <span>Select approved Data Dictionary</span>
        <input
          type="file"
          accept=".xlsm"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void load(file);
          }}
        />
      </label>
      {loading ? (
        <p role="status">Verifying and reading the local reference…</p>
      ) : null}
      {message !== null ? <p role="status">{message}</p> : null}
      {catalog !== null ? (
        <>
          <p>
            Lookup is exact and case-sensitive. A field name can occur in more
            than one table. Results are reference metadata, not mapping
            approval.
          </p>
          <div className="form-grid">
            <label>
              Field name
              <input
                value={fieldName}
                onChange={(event) => {
                  setFieldName(event.currentTarget.value);
                }}
              />
            </label>
            <label>
              Table name (optional)
              <input
                value={tableName}
                onChange={(event) => {
                  setTableName(event.currentTarget.value);
                }}
              />
            </label>
          </div>
          {lookup !== null ? (
            <div aria-live="polite">
              <p>
                {lookup.status === "ambiguous" && table === ""
                  ? "Ambiguous field name; choose the table before using a field identity. "
                  : ""}
                {String(visible.length)} matching record(s)
                {visible.length > 50 ? "; showing first 50" : ""}.
              </p>
              {visible.length > 0 ? (
                <ul>
                  {visible.slice(0, 50).map((item) => (
                    <li
                      key={`${item.identity.tableName}\0${item.identity.fieldName}`}
                    >
                      <strong>
                        {item.identity.tableName} / {item.identity.fieldName}
                      </strong>{" "}
                      — {item.rawDataType}, source {item.sourceSheet} row{" "}
                      {String(item.sourceRow)}; {String(item.description)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

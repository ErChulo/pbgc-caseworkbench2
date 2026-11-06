import { createProvisionalOracleTemplate } from "./provisional-oracle-template";
import { useState } from "react";
import type {
  ProvisionalOracleEvidence,
  ProvisionalOracleFormat,
} from "../../domain/validation-reconciliation/provisional-oracle-intake";

export function ProvisionalOraclePanel({
  enabled,
  workbookAvailable,
  formulaCells,
  onImport,
}: {
  readonly enabled: boolean;
  readonly workbookAvailable: boolean;
  readonly formulaCells: readonly {
    readonly formulaId: string;
    readonly cellAddress: string;
  }[];
  readonly onImport: (
    file: File,
    format: ProvisionalOracleFormat,
  ) => Promise<ProvisionalOracleEvidence>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] =
    useState<ProvisionalOracleFormat>("workbench-jsonl-v1");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProvisionalOracleEvidence | null>(
    null,
  );
  if (!enabled) return null;
  async function handleImport() {
    if (file === null || !workbookAvailable || busy) return;
    setBusy(true);
    setMessage(null);
    setProposal(null);
    try {
      setProposal(await onImport(file, format));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Oracle proposal could not be imported.",
      );
    } finally {
      setBusy(false);
    }
  }
  function downloadTemplate() {
    if (!workbookAvailable) return;
    const text = createProvisionalOracleTemplate(formulaCells);
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "provisional-oracle-template.jsonl";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section
      className="case-panel review-panel"
      aria-labelledby="provisional-oracle-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Local evidence intake</p>
          <h2 id="provisional-oracle-title">Provisional oracle evidence</h2>
        </div>
        <span className="status-chip status-chip-warning">Proposal only</span>
      </div>
      <p>
        Import local Workbench interchange data for the current workbook. The
        proposal is associated with the workbook model, not proof of a workbook
        file or execution. The application does not verify an external
        execution, authenticate the source, or approve formulas. Do not treat
        this proposal as release evidence.
      </p>
      <p>
        The exact input and proposal are saved in the local case workspace. They
        may contain case data. Use only files authorized for this case.
      </p>
      <details>
        <summary>View interchange requirements</summary>
        <p>
          These are Workbench formats, not verified vendor formats. Use the
          exact formula IDs and cell addresses from the current workbook model.
          Input must be UTF-8 and no larger than 8 MiB.
        </p>
        <p>
          JSON Lines: one object per line, for example{" "}
          <code>{'{"formulaId":"f1","cellAddress":"A1","value":0}'}</code>.
        </p>
        <p>
          JSON: an object with an <code>oracleId</code>, a <code>version</code>,
          a UTC <code>executedAt</code>, and a <code>results</code> array of
          those objects. These fields are assertions, not proof.
        </p>
      </details>
      {!workbookAvailable ? (
        <p className="notice" role="status">
          Generate the current V1 workbook before importing oracle evidence.
          Workbook generation is blocked when material inputs or approvals are
          missing.
        </p>
      ) : null}
      <p>
        The blank JSON Lines template contains the workbook model’s formula IDs
        and cell addresses. Add independently obtained results before import.
        Blank values are incomplete, not execution evidence.
      </p>
      <button
        type="button"
        disabled={!workbookAvailable || busy}
        onClick={downloadTemplate}
      >
        Download blank JSON Lines template
      </button>
      <label>
        Interchange format{" "}
        <select
          value={format}
          onChange={(event) => {
            setFormat(event.currentTarget.value as ProvisionalOracleFormat);
            setProposal(null);
            setMessage(null);
          }}
          disabled={!workbookAvailable || busy}
        >
          <option value="workbench-jsonl-v1">Workbench JSON Lines v1</option>
          <option value="workbench-json-v1">Workbench JSON v1</option>
        </select>
      </label>
      <label>
        Local oracle input{" "}
        <input
          type="file"
          accept=".json,.jsonl,application/json"
          disabled={!workbookAvailable || busy}
          onChange={(event) => {
            setFile(event.currentTarget.files?.[0] ?? null);
            setMessage(null);
            setProposal(null);
          }}
        />
      </label>
      <button
        type="button"
        className="button button-primary"
        disabled={!workbookAvailable || file === null || busy}
        onClick={() => void handleImport()}
      >
        {busy ? "Checking local input…" : "Save provisional evidence"}
      </button>
      {message ? (
        <p role="alert" className="form-message form-message-error">
          {message}
        </p>
      ) : null}
      {proposal ? (
        <div role="status" className="notice">
          <p>
            Local proposal saved:{" "}
            {proposal.status === "complete-proposal"
              ? "all formulas have a proposed result"
              : "results are incomplete or contain errors"}
            .
          </p>
          <p>
            Source hash: {proposal.sourceBytesSha256}. Missing formulas:{" "}
            {proposal.missingFormulaIds.length}. Failed formulas:{" "}
            {proposal.failedFormulaIds.length}.
          </p>
          <p>
            Human authority, source independence, and execution remain
            unverified. Formula approval stays blocked.
          </p>
        </div>
      ) : null}
    </section>
  );
}

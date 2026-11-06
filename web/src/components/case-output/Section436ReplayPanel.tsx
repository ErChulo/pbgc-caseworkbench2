import { useEffect, useRef, useState } from "react";
import type { Uuid } from "../../domain/shared/types";
import {
  MAX_SECTION_436_FILE_BYTES,
  verifySection436Replay,
  type Section436ReplaySummary,
} from "../../domain/section-436/replay-verification";

export function Section436ReplayPanel({ caseId }: { readonly caseId: Uuid }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<Section436ReplaySummary | null>(null);
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [],
  );

  async function checkFile() {
    if (!file || busy) return;
    const request = ++sequence.current;
    setBusy(true);
    setMessage(null);
    setSummary(null);
    try {
      if (file.size === 0 || file.size > MAX_SECTION_436_FILE_BYTES)
        throw new Error("Choose a nonempty JSON file no larger than 1 MiB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length !== file.size)
        throw new Error("The file could not be read completely.");
      const result = await verifySection436Replay(bytes, caseId);
      if (sequence.current === request) setSummary(result);
    } catch (error) {
      if (sequence.current === request)
        setMessage(
          error instanceof Error
            ? error.message
            : "The file could not be checked.",
        );
    } finally {
      if (sequence.current === request) setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="section436-replay-title"
      className="case-output-linker"
    >
      <h3 id="section436-replay-title">Check a Section 436 evaluation</h3>
      <p>
        Choose a local JSON evaluation for this case. The app checks its
        contract and content hash, and replays it with the current local
        evaluator. It also calculates the file hash. This check does not verify
        sources, actuarial correctness, review authority, or approval. It does
        not make the output package ready. The file may contain case details;
        keep it under local case-data controls.
      </p>
      <label>
        Evaluation JSON file (up to 1 MiB)
        <input
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            sequence.current += 1;
            setBusy(false);
            setFile(event.currentTarget.files?.[0] ?? null);
            setSummary(null);
            setMessage(null);
          }}
        />
      </label>
      <button
        type="button"
        className="button button-secondary"
        disabled={!file || busy}
        onClick={() => void checkFile()}
      >
        Check local evaluation
      </button>
      {message && <p role="alert">{message}</p>}
      {summary && (
        <div role="status">
          <p>
            Local replay matched. Evaluation status: {summary.evaluationStatus}.
            This is not approval or independent validation.
          </p>
          <p>
            File SHA-256: <code>{summary.fileSha256}</code>
          </p>
          <p>
            Evaluation content SHA-256:{" "}
            <code>{summary.evaluationContentSha256}</code>
          </p>
        </div>
      )}
    </section>
  );
}

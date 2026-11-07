import { useEffect, useRef, useState } from "react";
import { MAX_SECTION_436_FILE_BYTES } from "../../domain/section-436/replay-verification";
import {
  MAX_SECTION_436_PREVIEW_BYTES,
  verifyProvisionalSection436Preview,
  type ProvisionalSection436Verification,
} from "../../domain/section-436/provisional-verification";
import type { Uuid } from "../../domain/shared/types";

export function Section436PreviewVerificationPanel({
  caseId,
}: {
  readonly caseId: Uuid;
}) {
  const [preview, setPreview] = useState<File | null>(null);
  const [source, setSource] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] =
    useState<ProvisionalSection436Verification | null>(null);
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [],
  );

  function clear() {
    sequence.current += 1;
    setBusy(false);
    setMessage(null);
    setResult(null);
  }
  async function check() {
    if (!preview || !source || busy) return;
    const request = ++sequence.current;
    setBusy(true);
    setResult(null);
    setMessage(null);
    try {
      if (
        !preview.size ||
        preview.size > MAX_SECTION_436_PREVIEW_BYTES ||
        !source.size ||
        source.size > MAX_SECTION_436_FILE_BYTES
      )
        throw new Error(
          "Choose a nonempty preview up to 4 MiB and input up to 1 MiB.",
        );
      const [previewBytes, sourceBytes] = await Promise.all([
        preview.arrayBuffer(),
        source.arrayBuffer(),
      ]);
      if (
        previewBytes.byteLength !== preview.size ||
        sourceBytes.byteLength !== source.size
      )
        throw new Error("The selected files could not be read completely.");
      const checked = await verifyProvisionalSection436Preview(
        new Uint8Array(previewBytes),
        new Uint8Array(sourceBytes),
        caseId,
      );
      if (sequence.current === request) setResult(checked);
    } catch (error) {
      if (sequence.current === request)
        setMessage(
          error instanceof Error
            ? error.message
            : "The preview could not be checked.",
        );
    } finally {
      if (sequence.current === request) setBusy(false);
    }
  }

  return (
    <section
      className="case-output-linker"
      aria-labelledby="section436-preview-check-title"
    >
      <h3 id="section436-preview-check-title">
        Check a provisional Section 436 preview
      </h3>
      <p>
        Select the saved preview and its original input file for the active
        case. The app checks the input hash and regenerates the preview with the
        current evaluator. A match shows local consistency only; it does not
        authenticate sources, reviewer authority, or approval, validate
        actuarial correctness, or make the package ready.
      </p>
      <p>
        The files may contain case details. Keep them under local case-data
        controls. The app does not save them during this check.
      </p>
      <label>
        Provisional preview JSON file (up to 4 MiB)
        <input
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            clear();
            setPreview(event.currentTarget.files?.[0] ?? null);
          }}
        />
      </label>
      <label>
        Original preview input JSON file (up to 1 MiB)
        <input
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            clear();
            setSource(event.currentTarget.files?.[0] ?? null);
          }}
        />
      </label>
      <button
        type="button"
        className="button button-secondary"
        disabled={!preview || !source || busy}
        onClick={() => {
          void check();
        }}
      >
        Check preview and input
      </button>
      {message && <p role="alert">{message}</p>}
      {result && (
        <div role="status">
          <p>
            Local regeneration matched. Evaluation status:{" "}
            {result.evaluationStatus}. This is not approval or independent
            validation.
          </p>
          <p>
            Preview file SHA-256: <code>{result.previewFileSha256}</code>
          </p>
          <p>
            Input file SHA-256: <code>{result.sourceFileSha256}</code>
          </p>
          <p>
            Preview content SHA-256: <code>{result.previewContentSha256}</code>
          </p>
        </div>
      )}
    </section>
  );
}

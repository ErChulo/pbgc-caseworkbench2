import { useEffect, useRef, useState } from "react";
import {
  createProvisionalSection436Preview,
  section436InputTemplate,
} from "../../domain/section-436/provisional-preview";
import { MAX_SECTION_436_FILE_BYTES } from "../../domain/section-436/replay-verification";
import { parseUtcTimestamp, type Uuid } from "../../domain/shared/types";
import type { Section436EvaluationStatus } from "../../domain/section-436/models";

interface PreviewSnapshot {
  readonly blob: Blob;
  readonly status: Section436EvaluationStatus;
  readonly missingFacts: readonly string[];
  readonly blockedReasons: readonly string[];
  readonly sourceHash: string;
  readonly contentHash: string;
  readonly fileHash: string;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function Section436PreviewPanel({ caseId }: { readonly caseId: Uuid }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null);
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [],
  );

  async function createPreview() {
    if (!file || busy) return;
    const request = ++sequence.current;
    setBusy(true);
    setMessage(null);
    setSnapshot(null);
    try {
      if (file.size === 0 || file.size > MAX_SECTION_436_FILE_BYTES)
        throw new Error("Choose a nonempty JSON file no larger than 1 MiB.");
      const input = new Uint8Array(await file.arrayBuffer());
      if (input.length !== file.size)
        throw new Error("The file could not be read completely.");
      const now = parseUtcTimestamp(new Date().toISOString());
      if (!now.ok) throw new Error("The local time is invalid.");
      const result = await createProvisionalSection436Preview(
        input,
        caseId,
        now.value,
      );
      if (sequence.current !== request) return;
      const payload = result.preview.evaluation.deterministicPayload;
      setSnapshot({
        blob: new Blob([result.bytes], { type: "application/json" }),
        status: payload.evaluationStatus,
        missingFacts: payload.missingRequiredFacts,
        blockedReasons: payload.blockedReasons,
        sourceHash: result.preview.sourceFileSha256,
        contentHash: result.preview.previewContentSha256,
        fileHash: result.bytesSha256,
      });
    } catch (error) {
      if (sequence.current === request)
        setMessage(
          error instanceof Error
            ? error.message
            : "The preview could not be created.",
        );
    } finally {
      if (sequence.current === request) setBusy(false);
    }
  }

  return (
    <section
      className="case-output-linker"
      aria-labelledby="section436-preview-title"
    >
      <h3 id="section436-preview-title">
        Create a provisional Section 436 preview
      </h3>
      <p>
        Use a local input file for the active case. Review labels in the file
        are assertions, not verified approvals. Even a completed calculation is
        not actuarial approval, independent validation, or final output. This
        preview does not make the package ready.
      </p>
      <p>
        The preview stays in memory until you download it. It may contain case
        details; use local case-data controls. Its source hash records the
        selected bytes, not their authority.
      </p>
      <details>
        <summary>Input requirements</summary>
        <p>
          The UTF-8 JSON object must contain only caseId, facts, and rules. Use
          the empty case-bound template to start. The template has no facts or
          rules, so it produces a blocked preview.
        </p>
        <p>
          Each fact has factKey, value, valueKind, citations, and reviewStatus.
          Each rule has ruleId, description, operator, aftapPercentageThreshold,
          conclusionCode, limitationEffect, priority, effectiveDate, citations,
          and reviewStatus. Each citation has artifactSha256, sourceLocator, and
          description. These fields use the Section 436 evaluation contract; do
          not use invented rules as authority.
        </p>
        <p>
          The required fact keys are aftap-percentage, plan-year-start,
          plan-year-end, and certification-date. Values are strings; valueKind
          is date, decimal-percentage, or text. Review status is provisional or
          human-approved, but neither label proves approval. Use ISO dates,
          canonical decimal percentages, and at least one citation per record.
        </p>
        <p>
          Rule operators are less-than, less-than-or-equal,
          greater-than-or-equal, or equal. Conclusion codes are
          restriction-applies, no-restriction-identified, or
          additional-review-required. Priority is a positive integer. The app
          blocks incomplete, conflicting, or unsupported inputs.
        </p>
      </details>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => {
          download(
            new Blob([section436InputTemplate(caseId)], {
              type: "application/json",
            }),
            "section-436-empty-input-template.json",
          );
        }}
      >
        Download empty input template
      </button>
      <label>
        Preview input JSON file (up to 1 MiB)
        <input
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            sequence.current += 1;
            setBusy(false);
            setFile(event.currentTarget.files?.[0] ?? null);
            setSnapshot(null);
            setMessage(null);
          }}
        />
      </label>
      <button
        type="button"
        className="button button-secondary"
        disabled={!file || busy}
        onClick={() => void createPreview()}
      >
        Create provisional preview
      </button>
      {message && <p role="alert">{message}</p>}
      {snapshot && (
        <div role="status">
          <p>
            Provisional evaluation status: {snapshot.status}. This is not
            approval or independent validation.
          </p>
          {snapshot.missingFacts.length > 0 && (
            <p>Missing facts: {snapshot.missingFacts.join(", ")}</p>
          )}
          {snapshot.blockedReasons.length > 0 && (
            <>
              <p>Blockers:</p>
              <ul>
                {snapshot.blockedReasons.map((reason, index) => (
                  <li key={`${String(index)}-${reason}`}>{reason}</li>
                ))}
              </ul>
            </>
          )}
          <p>
            Input file SHA-256: <code>{snapshot.sourceHash}</code>
          </p>
          <p>
            Preview content SHA-256: <code>{snapshot.contentHash}</code>
          </p>
          <p>
            Preview file SHA-256: <code>{snapshot.fileHash}</code>
          </p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              download(
                snapshot.blob,
                `provisional-section-436-preview-${caseId}.json`,
              );
            }}
          >
            Download provisional preview
          </button>
        </div>
      )}
    </section>
  );
}

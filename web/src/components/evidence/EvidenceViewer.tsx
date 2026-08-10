import { useEffect, useRef, useState } from "react";

import {
  openLocalPdf,
  type LocalPdfDocument,
} from "../../adapters/parsers/local-pdf";
import type { EvidenceExtraction } from "../../domain/extraction/evidence-extraction";
import type { EvidenceTextCorrection } from "../../domain/extraction/evidence-correction";

export interface EvidenceViewerArtifact {
  readonly path: string;
  readonly sha256: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly extraction: EvidenceExtraction | null;
  readonly correction: EvidenceTextCorrection | null;
}

export function EvidenceViewer({
  artifact,
  loading,
  error,
  onSaveCorrection,
  onClose,
}: {
  readonly artifact: EvidenceViewerArtifact | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onSaveCorrection: (correctedText: string) => Promise<void>;
  readonly onClose: () => void;
}) {
  if (!loading && error === null && artifact === null) return null;
  return (
    <section
      className="case-panel evidence-viewer"
      aria-labelledby="evidence-viewer-title"
      aria-busy={loading}
    >
      <div className="panel-heading evidence-viewer-heading">
        <div>
          <p className="section-label">Exact preserved bytes</p>
          <h2 id="evidence-viewer-title">Evidence viewer</h2>
        </div>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={onClose}
        >
          Close viewer
        </button>
      </div>
      {loading ? (
        <p className="notice" role="status">
          Verifying and opening preserved evidence locally…
        </p>
      ) : null}
      {error !== null ? (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      ) : null}
      {artifact !== null ? (
        <>
          <dl className="evidence-viewer-identity">
            <div>
              <dt>Artifact</dt>
              <dd>{artifact.path}</dd>
            </div>
            <div>
              <dt>Media type</dt>
              <dd>{artifact.mediaType}</dd>
            </div>
            <div className="evidence-viewer-hash">
              <dt>Verified SHA-256</dt>
              <dd>
                <code>{artifact.sha256}</code>
              </dd>
            </div>
          </dl>
          <div className="evidence-viewer-grid">
            <div className="evidence-viewer-pane">
              <h3>Preserved original</h3>
              <OriginalPreview key={artifact.sha256} artifact={artifact} />
            </div>
            <div className="evidence-viewer-pane">
              <h3>Machine-extracted text</h3>
              <ExtractionPreview extraction={artifact.extraction} />
              {artifact.extraction !== null ? (
                <CorrectionEditor
                  key={artifact.sha256}
                  extraction={artifact.extraction}
                  correction={artifact.correction}
                  onSave={onSaveCorrection}
                />
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function CorrectionEditor({
  extraction,
  correction,
  onSave,
}: {
  readonly extraction: EvidenceExtraction;
  readonly correction: EvidenceTextCorrection | null;
  readonly onSave: (correctedText: string) => Promise<void>;
}) {
  const [value, setValue] = useState(
    correction?.correctedText ?? extraction.machineText,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async (): Promise<void> => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await onSave(value);
      setMessage(
        "Corrected text saved separately and is now the source for provisional classification and date analysis. The original machine extraction remains unchanged.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Corrected text could not be preserved locally.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="evidence-correction">
      <label htmlFor="evidence-corrected-text">Human-corrected text</label>
      <p>
        Edit only when the machine extraction differs from the visible original.
        This creates a separate immutable correction and never changes source
        bytes or machine output.
      </p>
      <textarea
        id="evidence-corrected-text"
        rows={12}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      <button
        type="button"
        className="button button-primary"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? "Saving correction…" : "Save corrected text"}
      </button>
      {message !== null ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      {error !== null ? (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function OriginalPreview({
  artifact,
}: {
  readonly artifact: EvidenceViewerArtifact;
}) {
  if (artifact.mediaType === "application/pdf") {
    return <PdfPreview bytes={artifact.bytes} label={artifact.path} />;
  }
  if (
    artifact.mediaType === "image/png" ||
    artifact.mediaType === "image/jpeg" ||
    artifact.mediaType === "image/gif"
  ) {
    return (
      <RasterPreview
        bytes={artifact.bytes}
        mediaType={artifact.mediaType}
        label={artifact.path}
      />
    );
  }
  if (artifact.mediaType.startsWith("text/")) {
    return (
      <pre className="evidence-text-preview" tabIndex={0}>
        {new TextDecoder("utf-8", { fatal: false }).decode(artifact.bytes)}
      </pre>
    );
  }
  return (
    <p className="notice">
      The original bytes are preserved and verified, but this format has no
      approved in-app renderer. The file was not executed.
    </p>
  );
}

function ExtractionPreview({
  extraction,
}: {
  readonly extraction: EvidenceExtraction | null;
}) {
  if (extraction === null) {
    return (
      <p className="notice">
        No verified machine extraction is available for this artifact.
      </p>
    );
  }
  return (
    <div className="evidence-extraction">
      <p className="evidence-extraction-meta">
        <strong>{extraction.parserId}</strong> version{" "}
        {extraction.parserVersion}
        {" · "}
        {extraction.status}
      </p>
      {extraction.machineText.trim() === "" ? (
        <p className="notice">No machine text was found.</p>
      ) : (
        <pre className="evidence-text-preview" tabIndex={0}>
          {extraction.machineText}
        </pre>
      )}
      {extraction.limitations.length > 0 ? (
        <div className="evidence-limitations">
          <strong>Extraction limitations</strong>
          <ul>
            {extraction.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PdfPreview({
  bytes,
  label,
}: {
  readonly bytes: Uint8Array;
  readonly label: string;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const document = useRef<LocalPdfDocument | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1);
  const [status, setStatus] = useState("Loading PDF locally…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let opened: LocalPdfDocument | null = null;
    void openLocalPdf(bytes)
      .then((value) => {
        if (cancelled) {
          void value.destroy();
          return;
        }
        opened = value;
        document.current = value;
        setPageCount(value.pageCount);
        setPageNumber(1);
        setStatus("PDF ready.");
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "This PDF could not be rendered safely in the local viewer.",
          );
        }
      });
    return () => {
      cancelled = true;
      document.current = null;
      if (opened !== null) void opened.destroy();
    };
  }, [bytes]);

  useEffect(() => {
    const opened = document.current;
    const target = canvas.current;
    if (opened === null || target === null || pageCount === 0) return;
    let cancelled = false;
    void opened
      .renderPage(target, pageNumber, scale)
      .then(() => {
        if (!cancelled) setStatus(`Page ${String(pageNumber)} rendered.`);
      })
      .catch(() => {
        if (!cancelled)
          setError("The selected PDF page could not be rendered.");
      });
    return () => {
      cancelled = true;
    };
  }, [pageCount, pageNumber, scale]);

  return (
    <div className="pdf-preview">
      <div className="pdf-controls" aria-label="PDF page controls">
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={pageNumber <= 1}
          onClick={() => {
            setPageNumber((current) => Math.max(1, current - 1));
          }}
        >
          Previous page
        </button>
        <span>
          Page {String(pageNumber)} of {String(pageCount)}
        </span>
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={pageCount === 0 || pageNumber >= pageCount}
          onClick={() => {
            setPageNumber((current) => Math.min(pageCount, current + 1));
          }}
        >
          Next page
        </button>
        <label>
          <span>Zoom</span>
          <select
            value={scale}
            onChange={(event) => {
              setScale(Number(event.target.value));
            }}
          >
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
          </select>
        </label>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {status}
      </p>
      {error !== null ? (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="document-canvas-wrap">
        <canvas ref={canvas} role="img" aria-label={`PDF preview of ${label}`}>
          PDF page preview for {label}
        </canvas>
      </div>
    </div>
  );
}

function RasterPreview({
  bytes,
  mediaType,
  label,
}: {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly label: string;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const target = canvas.current;
    if (target === null) return;
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    setError(null);
    void createImageBitmap(
      new Blob([Uint8Array.from(bytes)], { type: mediaType }),
    )
      .then((image) => {
        bitmap = image;
        if (cancelled) return;
        const maximumDimension = 2400;
        const scale = Math.min(
          1,
          maximumDimension / Math.max(image.width, image.height),
        );
        target.width = Math.max(1, Math.round(image.width * scale));
        target.height = Math.max(1, Math.round(image.height * scale));
        const context = target.getContext("2d", { alpha: false });
        if (context === null) throw new Error("Canvas unavailable.");
        context.drawImage(image, 0, 0, target.width, target.height);
      })
      .catch(() => {
        if (!cancelled)
          setError("This raster image could not be decoded locally.");
      });
    return () => {
      cancelled = true;
      bitmap?.close();
    };
  }, [bytes, mediaType]);
  return (
    <>
      {error !== null ? (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="document-canvas-wrap">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Image preview of ${label}`}
        >
          Image preview for {label}
        </canvas>
      </div>
    </>
  );
}

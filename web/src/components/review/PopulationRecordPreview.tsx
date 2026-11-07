import { useEffect, useRef, useState } from "react";
import type {
  PopulationRecordFieldBinding,
  PopulationRecordProjection,
} from "../../domain/population/record-projection";
import type { PopulationReviewItem } from "./PopulationReview";

function parseBindings(text: string): readonly PopulationRecordFieldBinding[] {
  if (text.length > 16_384)
    throw new Error("Field bindings must be no larger than 16 KiB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Field bindings must be a JSON array.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 50)
    throw new Error("Provide one to 50 explicit field bindings.");
  return parsed.map((value: unknown) => {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new Error(
        "Each binding needs field, column, and expectedHeader text.",
      );
    const entry = value as Record<string, unknown>;
    if (
      Object.keys(entry).sort().join(",") !== "column,expectedHeader,field" ||
      typeof entry.field !== "string" ||
      typeof entry.column !== "string" ||
      typeof entry.expectedHeader !== "string" ||
      [entry.field, entry.column, entry.expectedHeader].some(
        (part) => typeof part !== "string" || part.length > 512,
      )
    )
      throw new Error(
        "Each binding needs only field, column, and expectedHeader text, up to 512 characters each.",
      );
    return {
      field: entry.field,
      column: entry.column,
      expectedHeader: entry.expectedHeader,
    };
  });
}

function displayed(value: string | number | boolean): string {
  return JSON.stringify(value).replace(
    /[\p{Cc}\p{Cf}\u2028\u2029]/gu,
    (character) =>
      `\\u{${(character.codePointAt(0) ?? 0).toString(16).toUpperCase()}}`,
  );
}

export function PopulationRecordPreview({
  item,
  onPreview,
}: {
  readonly item: PopulationReviewItem;
  readonly onPreview: (
    item: PopulationReviewItem,
    selection: {
      readonly sheetName: string;
      readonly sourceRow: number;
      readonly bindings: readonly PopulationRecordFieldBinding[];
    },
  ) => Promise<PopulationRecordProjection>;
}) {
  const [sheet, setSheet] = useState("");
  const [row, setRow] = useState("");
  const [bindings, setBindings] = useState(
    '[{"field":"","column":"","expectedHeader":""}]',
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [record, setRecord] = useState<PopulationRecordProjection | null>(null);
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
    setRecord(null);
  }
  async function inspect() {
    if (busy) return;
    const request = ++sequence.current;
    setBusy(true);
    setMessage(null);
    setRecord(null);
    try {
      if (
        !sheet.trim() ||
        sheet !== sheet.trim() ||
        sheet.length > 255 ||
        !/^[1-9][0-9]*$/u.test(row)
      )
        throw new Error("Enter the exact sheet name and a one-based data row.");
      const sourceRow = Number(row);
      if (
        !Number.isSafeInteger(sourceRow) ||
        sourceRow < 2 ||
        sourceRow > 1_048_576
      )
        throw new Error("Choose a data row from 2 to 1048576.");
      const result = await onPreview(item, {
        sheetName: sheet,
        sourceRow,
        bindings: parseBindings(bindings),
      });
      if (sequence.current === request) setRecord(result);
    } catch (error) {
      if (sequence.current === request)
        setMessage(
          error instanceof Error
            ? error.message
            : "The record could not be inspected.",
        );
    } finally {
      if (sequence.current === request) setBusy(false);
    }
  }
  return (
    <section
      className="case-output-linker"
      aria-label="Local population record inspection"
    >
      <h4>Inspect an explicit source row</h4>
      <p>
        This local, temporary view can show participant data. Use it only in an
        authorized case and protect the screen. It does not approve a person,
        field mapping, workbook routing, or final output. Nothing is saved by
        this view.
      </p>
      <p>
        Enter the exact sheet name, one-based row, and explicit field-to-column
        bindings. Each binding must name a generic field, an uppercase source
        column, and the exact row-one header. No match or participant is chosen
        automatically.
      </p>
      <label>
        Source sheet name
        <input
          value={sheet}
          onChange={(event) => {
            clear();
            setSheet(event.currentTarget.value);
          }}
          autoComplete="off"
        />
      </label>
      <label>
        Source row number
        <input
          inputMode="numeric"
          value={row}
          onChange={(event) => {
            clear();
            setRow(event.currentTarget.value);
          }}
          autoComplete="off"
        />
      </label>
      <label>
        Explicit field bindings JSON
        <textarea
          value={bindings}
          onChange={(event) => {
            clear();
            setBindings(event.currentTarget.value);
          }}
          rows={3}
          spellCheck={false}
        />
      </label>
      <button
        type="button"
        className="button button-secondary"
        disabled={busy}
        onClick={() => {
          void inspect();
        }}
      >
        Inspect source row locally
      </button>
      {message && <p role="alert">{message}</p>}
      {record && (
        <div role="status">
          <p>
            Local inspection only; no authorization or routing approval is
            established. Source row: {record.sourceRow}. Profile SHA-256:{" "}
            <code>{record.workbookProfileContentSha256}</code>. Record SHA-256:{" "}
            <code>{record.recordContentSha256}</code>.
          </p>
          <ul>
            {record.fields.map((field) => (
              <li key={field.field}>
                <strong>{displayed(field.field)}</strong> at{" "}
                {field.sourceAddress}: {field.state}
                {field.state === "value" && field.value !== null ? (
                  <>
                    {" "}
                    — <code>{displayed(field.value)}</code>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              clear();
              setSheet("");
              setRow("");
              setBindings('[{"field":"","column":"","expectedHeader":""}]');
            }}
          >
            Clear local row view
          </button>
        </div>
      )}
    </section>
  );
}

import type { IobMetadataObservation } from "../../domain/population/iob-metadata-inspection";
import { useEffect, useRef, useState } from "react";
import type { OfficialFieldCatalogIndex } from "../../domain/field-catalog/models";
import type { BuildSpecV2 } from "../../domain/build-spec/models";
import {
  preflightPopulationRouting,
  type RoutingIssueCode,
} from "../../domain/workbook-builder/population-routing-preflight";
import type {
  PopulationRecordFieldBinding,
  PopulationRecordProjection,
} from "../../domain/population/record-projection";
import type { PopulationReviewItem } from "./PopulationReview";

const emptyBinding = (): PopulationRecordFieldBinding => ({
  field: "",
  column: "",
  expectedHeader: "",
});

function validateBindings(
  bindings: readonly PopulationRecordFieldBinding[],
): readonly PopulationRecordFieldBinding[] {
  if (JSON.stringify(bindings).length > 16_384)
    throw new Error("Field bindings must be no larger than 16 KiB.");
  if (bindings.length === 0 || bindings.length > 50)
    throw new Error("Provide one to 50 explicit field bindings.");
  if (
    bindings.some(
      ({ field, column, expectedHeader }) =>
        !field.trim() ||
        field !== field.trim() ||
        !/^[A-Z]{1,3}$/u.test(column) ||
        !expectedHeader.trim() ||
        [field, column, expectedHeader].some((part) => part.length > 512),
    )
  )
    throw new Error(
      "Each binding needs a generic field, an uppercase source column, and the exact source header.",
    );
  return bindings;
}

function fieldReference(
  catalog: OfficialFieldCatalogIndex | null,
  field: string,
): string {
  if (!field) return "Enter a field name to check the reference.";
  if (catalog === null)
    return "Load the approved Data Dictionary to check this name.";
  const result = catalog.lookupFieldName(field);
  if (result.status === "not-found")
    return "No exact field name found in the loaded Data Dictionary. This does not rule out a governed user-defined field.";
  if (result.status === "unique")
    return `One exact reference match: table ${result.record.identity.tableName}.`;
  return `${String(result.records.length)} exact reference matches in different tables. Check the table-qualified identity in the Data Dictionary lookup.`;
}

const ROUTING_ISSUES: Record<RoutingIssueCode, string> = {
  LINEAGE_MISMATCH:
    "The case or approved population lineage does not match this record.",
  TARGET_INVALID: "The target cell address is invalid.",
  TARGET_HEADER_ROW:
    "The target is in row one, which may contain a source header.",
  TARGET_COLLISION: "More than one mapping uses this target cell.",
  INPUT_FORMULA_COLLISION: "An input and formula use the same target cell.",
  FORMULA_TARGET_COLLISION: "More than one formula uses this target cell.",
  B_SEMANTICS_REQUIRED: "B-classified input/output behavior needs review.",
  SOURCE_UNSUPPORTED:
    "The mapping does not identify this population sheet and field.",
  SOURCE_FIELD_MISSING: "This field was not included in the inspected row.",
  SOURCE_FIELD_AMBIGUOUS:
    "This field occurs more than once in the inspected row.",
  SOURCE_VALUE_UNAVAILABLE:
    "The inspected source cell is blank, missing, a formula, or an error.",
};

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
  fieldCatalog = null,
  buildSpec = null,
  caseId = null,
}: {
  readonly item: PopulationReviewItem;
  readonly fieldCatalog?: OfficialFieldCatalogIndex | null;
  readonly buildSpec?: BuildSpecV2 | null;
  readonly caseId?: string | null;
  readonly onPreview: (
    item: PopulationReviewItem,
    selection: {
      readonly sheetName: string;
      readonly sourceRow: number;
      readonly metadataRow?: number;
      readonly bindings: readonly PopulationRecordFieldBinding[];
    },
  ) => Promise<
    PopulationRecordProjection & {
      readonly iobMetadata?: IobMetadataObservation;
    }
  >;
}) {
  const [sheet, setSheet] = useState("");
  const [row, setRow] = useState("");
  const [metadataRow, setMetadataRow] = useState("");
  const [bindings, setBindings] = useState<
    readonly PopulationRecordFieldBinding[]
  >([emptyBinding()]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [record, setRecord] = useState<
    | (PopulationRecordProjection & {
        readonly iobMetadata?: IobMetadataObservation;
      })
    | null
  >(null);
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
      if (metadataRow && !/^[1-9][0-9]*$/u.test(metadataRow))
        throw new Error("Enter a one-based metadata row or leave it blank.");
      const result = await onPreview(item, {
        sheetName: sheet,
        sourceRow,
        ...(metadataRow ? { metadataRow: Number(metadataRow) } : {}),
        bindings: validateBindings(bindings),
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
  const routing =
    record !== null && buildSpec !== null && caseId !== null
      ? preflightPopulationRouting(buildSpec, record, caseId)
      : null;
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
      <p>
        Field-name reference checks are exact and case-sensitive. A match does
        not establish a field mapping or approval. The Data Dictionary stays in
        this browser session and is not saved to the case.
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
        Optional I/O/B metadata row number
        <input
          inputMode="numeric"
          value={metadataRow}
          onChange={(event) => {
            clear();
            setMetadataRow(event.currentTarget.value);
          }}
          autoComplete="off"
        />
      </label>
      <p>
        Choose the metadata row from the source. Values are observations only
        and do not establish routing or B semantics.
      </p>
      {bindings.map((binding, index) => (
        <fieldset key={index}>
          <legend>Field binding {index + 1}</legend>
          {(
            [
              ["field", "Generic field"],
              ["column", "Source column"],
              ["expectedHeader", "Exact row-one header"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label} {index + 1}
              <input
                value={binding[key]}
                maxLength={512}
                autoComplete="off"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  clear();
                  setBindings((current) =>
                    current.map((entry, position) =>
                      position === index ? { ...entry, [key]: value } : entry,
                    ),
                  );
                }}
              />
            </label>
          ))}
          <p aria-live="polite">
            Field reference {index + 1}:{" "}
            {fieldReference(fieldCatalog, binding.field)}
          </p>
          <button
            type="button"
            className="button button-secondary"
            disabled={bindings.length === 1}
            onClick={() => {
              clear();
              setBindings((current) =>
                current.filter((_, position) => position !== index),
              );
            }}
          >
            Remove field binding {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button button-secondary"
        disabled={bindings.length >= 50}
        onClick={() => {
          clear();
          setBindings((current) => [...current, emptyBinding()]);
        }}
      >
        Add field binding
      </button>
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
          {routing === null ? (
            <p>
              Generate a current BuildSpec to inspect potential routing
              conflicts for this row.
            </p>
          ) : (
            <div>
              <h5>Routing preflight — not authorization</h5>
              <p>
                {routing.inputMappingCount} input or B mappings checked;{" "}
                {routing.issues.length} issues found. No values were routed or
                written. A clear preflight does not approve a mapping or enable
                workbook generation.
              </p>
              {routing.issues.length > 0 && (
                <ul>
                  {routing.issues.slice(0, 50).map((issue, index) => (
                    <li
                      key={`${issue.code}-${issue.mappingId ?? "lineage"}-${String(index)}`}
                    >
                      {ROUTING_ISSUES[issue.code]}
                      {issue.tabName !== null && (
                        <>
                          {" "}
                          Field {displayed(issue.field ?? "")}, scenario{" "}
                          {displayed(issue.scenarioId ?? "")}, target{" "}
                          {displayed(issue.tabName)}!
                          {displayed(issue.cellAddress ?? "")}.
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {routing.issues.length > 50 && (
                <p>Showing the first 50 issues.</p>
              )}
            </div>
          )}
          {record.iobMetadata && (
            <div>
              <h5>Observed I/O/B metadata — not approval</h5>
              <p>
                Source row {record.iobMetadata.metadataRow}; exact uppercase I,
                O, and B only. Other states need review. These observations are
                not included in the record hash.
              </p>
              <ul>
                {record.iobMetadata.fields.map((field) => (
                  <li key={field.field}>
                    {displayed(field.field)} at {field.sourceAddress}:{" "}
                    {field.state}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
              setMetadataRow("");
              setBindings([emptyBinding()]);
            }}
          >
            Clear local row view
          </button>
        </div>
      )}
    </section>
  );
}

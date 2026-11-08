/** Local limits on evidence text metadata; not a source-eligibility policy. */
export const EVIDENCE_TEXT_RECORD_MAX_BYTES = 64 * 1024 * 1024;
export const CORRECTION_MAX_CODE_UNITS = 8 * 1024 * 1024;

export function requireEvidenceTextRecordSize(bytes: Uint8Array): void {
  if (bytes.length > EVIDENCE_TEXT_RECORD_MAX_BYTES) {
    throw new Error("Evidence text record exceeds the 64 MiB local limit.");
  }
}

export function requireCorrectionTextSize(text: string): void {
  if (text.length > CORRECTION_MAX_CODE_UNITS) {
    throw new Error("Corrected text exceeds the 8 Mi UTF-16 code-unit limit.");
  }
}

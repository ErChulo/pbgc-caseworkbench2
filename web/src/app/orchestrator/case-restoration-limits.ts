/** Local resource limits, not authorization or schema limits. */
export const CASE_RESTORE_POINTER_MAX_BYTES = 64 * 1024;
export const CASE_RESTORE_RECORD_MAX_BYTES = 16 * 1024 * 1024;

export function requireRestorableRecordSize(bytes: Uint8Array): void {
  if (bytes.length > CASE_RESTORE_RECORD_MAX_BYTES) {
    throw new Error("Case record exceeds the 16 MiB local restoration limit.");
  }
}

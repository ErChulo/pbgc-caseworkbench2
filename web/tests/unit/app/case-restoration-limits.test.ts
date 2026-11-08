import { expect, it } from "vitest";
import {
  CASE_RESTORE_POINTER_MAX_BYTES,
  CASE_RESTORE_RECORD_MAX_BYTES,
  requireRestorableRecordSize,
} from "../../../src/app/orchestrator/case-restoration-limits";

it("enforces the documented metadata bounds without changing accepted bytes", () => {
  expect(CASE_RESTORE_POINTER_MAX_BYTES).toBe(64 * 1024);
  const limit = new Uint8Array(CASE_RESTORE_RECORD_MAX_BYTES);
  expect(() => {
    requireRestorableRecordSize(limit);
  }).not.toThrow();
  expect(() => {
    requireRestorableRecordSize(
      new Uint8Array(CASE_RESTORE_RECORD_MAX_BYTES + 1),
    );
  }).toThrow(/16 MiB/);
});

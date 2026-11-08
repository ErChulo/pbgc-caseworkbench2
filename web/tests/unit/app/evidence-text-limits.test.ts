import { expect, it } from "vitest";
import {
  CORRECTION_MAX_CODE_UNITS,
  EVIDENCE_TEXT_RECORD_MAX_BYTES,
  requireCorrectionTextSize,
  requireEvidenceTextRecordSize,
} from "../../../src/app/orchestrator/evidence-text-limits";

it("enforces explicit local bounds before writing text records", () => {
  expect(() => {
    requireCorrectionTextSize("x".repeat(CORRECTION_MAX_CODE_UNITS));
  }).not.toThrow();
  expect(() => {
    requireCorrectionTextSize("x".repeat(CORRECTION_MAX_CODE_UNITS + 1));
  }).toThrow(/8 Mi/);
  expect(() => {
    requireEvidenceTextRecordSize(
      new Uint8Array(EVIDENCE_TEXT_RECORD_MAX_BYTES),
    );
  }).not.toThrow();
  expect(() => {
    requireEvidenceTextRecordSize(
      new Uint8Array(EVIDENCE_TEXT_RECORD_MAX_BYTES + 1),
    );
  }).toThrow(/64 MiB/);
});

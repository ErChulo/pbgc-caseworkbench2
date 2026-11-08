import { describe, expect, it } from "vitest";
import { validateContract } from "../../../../src/contracts/schema-validator";
import { approvedV1SummaryReferences } from "../../../../src/domain/draft-v1-summary/reference-index";
import { createDraftV1SummaryArtifact } from "../../../../src/domain/draft-v1-summary/draft-builder";
import { verifyDraftV1SummaryArtifact } from "../../../../src/domain/draft-v1-summary/verification";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
} from "../../../../src/domain/shared/types";

const a = parseUuid("00000000-0000-4000-8000-000000000001");
const b = parseUuid("00000000-0000-4000-8000-000000000002");
const hash = parseSha256("a".repeat(64));
const time = parseUtcTimestamp("2026-11-08T12:00:00.000Z");
if (!a.ok || !b.ok || !hash.ok || !time.ok)
  throw new Error("Invalid synthetic fixture");

describe("draft summary verification", () => {
  it("accepts a matching blocked artifact but rejects another case and changed payload", async () => {
    const draft = await createDraftV1SummaryArtifact({
      caseId: a.value,
      r5Summary: { fields: ["DOB"] },
      r5SummaryContentSha256: hash.value,
      r5SummaryFileName: "synthetic.json",
      generatedAt: time.value,
      generatedBy: "synthetic",
    });
    expect(await verifyDraftV1SummaryArtifact(draft, a.value)).toEqual(draft);
    expect(await verifyDraftV1SummaryArtifact(draft, b.value)).toBeNull();
    const tampered = structuredClone(draft);
    (tampered.deterministicPayload.r5Source as { fileName: string }).fileName =
      "tampered.json";
    expect(await verifyDraftV1SummaryArtifact(tampered, a.value)).toBeNull();
    expect(
      await verifyDraftV1SummaryArtifact(
        { ...draft, contentSha256: "b".repeat(64) },
        a.value,
      ),
    ).toBeNull();
    expect(
      await verifyDraftV1SummaryArtifact({ bad: true }, a.value),
    ).toBeNull();
  });
  it("produces contract-valid blocked previews for each indexed reference", async () => {
    for (const reference of approvedV1SummaryReferences) {
      const draft = await createDraftV1SummaryArtifact({
        caseId: a.value,
        r5Summary: {},
        r5SummaryContentSha256: hash.value,
        r5SummaryFileName: "synthetic.json",
        generatedAt: time.value,
        generatedBy: null,
        references: [reference],
      });
      const validation = validateContract("draftV1Summary", draft);
      expect({ file: reference.fileName, issues: validation.issues }).toEqual({
        file: reference.fileName,
        issues: [],
      });
      expect(
        draft.deterministicPayload.draftSummary.fieldPreview.every(
          (field) => field.length > 0,
        ),
      ).toBe(true);
    }
  }, 30_000);
  it("captures the caller's object before asynchronous hashing", async () => {
    const draft = structuredClone(
      await createDraftV1SummaryArtifact({
        caseId: a.value,
        r5Summary: { fields: ["DOB"] },
        r5SummaryContentSha256: hash.value,
        r5SummaryFileName: "synthetic.json",
        generatedAt: time.value,
        generatedBy: null,
      }),
    );
    const pending = verifyDraftV1SummaryArtifact(draft, a.value);
    (draft.deterministicPayload.r5Source as { fileName: string }).fileName =
      "changed.json";
    const result = await pending;
    expect(result?.deterministicPayload.r5Source.fileName).toBe(
      "synthetic.json",
    );
  });
});

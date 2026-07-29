import { describe, expect, it } from "vitest";

import {
  buildLocalPackage,
  importLocalPackage,
  storeValidatedPackage,
  validateDeidentifiedPackage,
  type DeidentifiedEnvelope,
} from "../../src/domain/exports/deidentification-gate";
import { hashTyped } from "../../src/domain/manifests/canonical-json";
import { parseSha256 } from "../../src/domain/shared/types";
import {
  deidentifiedExport,
  syntheticExport,
} from "../fixtures/contracts/schema-cases";

async function envelope(
  source: typeof syntheticExport | typeof deidentifiedExport,
): Promise<DeidentifiedEnvelope> {
  const cloned = structuredClone(source) as unknown as DeidentifiedEnvelope;
  const digest = await hashTyped(cloned.deterministicPayload, {
    schemaId: "deidentified-export.schema.json",
  });
  const sha = parseSha256(digest);
  if (!sha.ok) throw new Error("fixture hash");
  const history = Array.isArray(
    (cloned.operationalMetadata as Record<string, unknown>)
      .humanApprovalHistory,
  )
    ? ((cloned.operationalMetadata as Record<string, unknown>)
        .humanApprovalHistory as Record<string, unknown>[])
    : [];
  return {
    ...cloned,
    deterministicPayloadSha256: sha.value,
    operationalMetadata: {
      ...cloned.operationalMetadata,
      humanApprovalHistory: history.map((item) => ({
        ...item,
        deterministicPayloadSha256: sha.value,
      })),
    },
  };
}

describe("T063 local de-identification boundary", () => {
  it("validates and stores synthetic/mock packages locally without transmission", async () => {
    const value = await envelope(syntheticExport);
    expect(await validateDeidentifiedPackage(value)).toMatchObject({
      ok: true,
    });
    const stored = new Map<string, Uint8Array>();
    expect(
      await storeValidatedPackage(
        {
          createImmutable: (path, bytes) => {
            if (stored.has(path)) return Promise.resolve(false);
            stored.set(path, bytes);
            return Promise.resolve(true);
          },
          read: (path) => Promise.resolve(stored.get(path) ?? null),
        },
        "exports/synthetic.json",
        value,
      ),
    ).toMatchObject({ ok: true });
    expect(stored.size).toBe(1);
    expect(
      await importLocalPackage(
        {
          createImmutable: () => Promise.resolve(false),
          read: (path) => Promise.resolve(stored.get(path) ?? null),
        },
        "exports/synthetic.json",
      ),
    ).toMatchObject({ ok: true });
  });

  it("builds deterministic local-only envelopes without transport metadata affecting the hash", async () => {
    const source = await envelope(syntheticExport);
    const first = await buildLocalPackage(
      source.deterministicPayload,
      (payloadHash) => {
        expect(payloadHash).toMatch(/^[a-f0-9]{64}$/u);
        return {
          ...source.operationalMetadata,
          sessionIdentifier: "session-one",
        };
      },
    );
    const second = await buildLocalPackage(
      source.deterministicPayload,
      (payloadHash) => {
        expect(payloadHash).toMatch(/^[a-f0-9]{64}$/u);
        return {
          ...source.operationalMetadata,
          sessionIdentifier: "session-two",
        };
      },
    );
    expect(first.deterministicPayloadSha256).toBe(
      second.deterministicPayloadSha256,
    );
  });

  it("accepts an exact-payload human-approved de-identified package", async () => {
    expect(
      await validateDeidentifiedPackage(await envelope(deidentifiedExport)),
    ).toMatchObject({ ok: true });
  });

  it.each(["ssn", "exactDateOfBirth", "unapprovedField"])(
    "rejects prohibited or non-allowlisted field %s",
    async (field) => {
      const value = await envelope(syntheticExport);
      const payload = {
        ...value.deterministicPayload,
        records: [
          {
            generalKey: "mock-001",
            ageBand: "60-64",
            [field]: "synthetic-prohibited",
          },
        ],
      };
      const digest = await hashTyped(payload, {
        schemaId: "deidentified-export.schema.json",
      });
      const parsed = parseSha256(digest);
      if (!parsed.ok) throw new Error("fixture");
      expect(
        await validateDeidentifiedPackage({
          ...value,
          deterministicPayload: payload,
          deterministicPayloadSha256: parsed.value,
        }),
      ).toMatchObject({ ok: false });
    },
  );

  it("rejects a human approval bound to another deterministic payload", async () => {
    const value = await envelope(deidentifiedExport);
    expect(
      await validateDeidentifiedPackage({
        ...value,
        operationalMetadata: {
          ...value.operationalMetadata,
          humanApprovalHistory: [
            {
              ...(
                value.operationalMetadata.humanApprovalHistory as Record<
                  string,
                  unknown
                >[]
              )[0],
              deterministicPayloadSha256: "b".repeat(64),
            },
          ],
        },
      }),
    ).toMatchObject({ ok: false });
  });
});

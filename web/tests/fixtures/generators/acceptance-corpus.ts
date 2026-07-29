import { hashChunkReader } from "../../../src/workers/hash.worker";
import { deterministicSha256 } from "../../../src/domain/normalization/normalizer";
import { parseSha256, type Sha256 } from "../../../src/domain/shared/types";
import { archiveFixtures } from "./archives";
import { readerFromBytes, deterministicBytes } from "./artifacts";
import {
  csvFixture,
  docxFixture,
  jsonFixture,
  invalidJsonFixture,
  malformedCsvFixture,
  pdfFixture,
  pptxFixture,
  textFixture,
  workbookFixture,
} from "./passive-formats";
import {
  dosExecutableFixture,
  elfExecutableFixture,
  unsupportedBinaryFixture,
} from "./unsafe-binaries";
import { syntheticSensitiveFixture } from "./sensitive-data";

export interface AcceptanceCorpusArtifact {
  readonly path: string;
  readonly kind:
    | "text"
    | "json"
    | "csv"
    | "tsv"
    | "pdf"
    | "docx"
    | "pptx"
    | "xlsx"
    | "zip"
    | "gzip"
    | "binary"
    | "sensitive";
  readonly mediaType: string | null;
  readonly sizeBytes: number;
  readonly sha256: Sha256;
  readonly bytes: Uint8Array;
}

export interface AcceptanceCorpusPlanArtifact {
  readonly path: string;
  readonly kind: "sparse";
  readonly mediaType: string | null;
  readonly sizeBytes: number;
  readonly sha256: Sha256;
  readonly bytePattern: string;
}

export interface AcceptanceCorpusSet {
  readonly mixedArtifacts: readonly AcceptanceCorpusArtifact[];
  readonly sparseArtifacts: readonly AcceptanceCorpusPlanArtifact[];
}

export async function buildAcceptanceCorpusSet(): Promise<AcceptanceCorpusSet> {
  return {
    mixedArtifacts: await buildMixedArtifacts(),
    sparseArtifacts: await buildSparseArtifacts(),
  };
}

async function buildMixedArtifacts(): Promise<
  readonly AcceptanceCorpusArtifact[]
> {
  const base = [
    {
      kind: "text" as const,
      mediaType: "text/plain",
      path: "text.txt",
      bytes: textFixture(),
    },
    {
      kind: "json" as const,
      mediaType: "application/json",
      path: "json.json",
      bytes: jsonFixture(),
    },
    {
      kind: "csv" as const,
      mediaType: "text/csv",
      path: "csv.csv",
      bytes: csvFixture(),
    },
    {
      kind: "tsv" as const,
      mediaType: "text/tab-separated-values",
      path: "tsv.tsv",
      bytes: malformedCsvFixture(),
    },
    {
      kind: "pdf" as const,
      mediaType: "application/pdf",
      path: "pdf.pdf",
      bytes: pdfFixture(),
    },
    {
      kind: "docx" as const,
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      path: "docx.docx",
      bytes: docxFixture(),
    },
    {
      kind: "pptx" as const,
      mediaType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      path: "pptx.pptx",
      bytes: pptxFixture(),
    },
    {
      kind: "xlsx" as const,
      mediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      path: "workbook.xlsx",
      bytes: workbookFixture({ hidden: true }),
    },
    {
      kind: "zip" as const,
      mediaType: "application/zip",
      path: "archive.zip",
      bytes: archiveFixtures().nested,
    },
    {
      kind: "gzip" as const,
      mediaType: "application/gzip",
      path: "archive.gz",
      bytes: archiveFixtures().gzip,
    },
    {
      kind: "binary" as const,
      mediaType: "application/octet-stream",
      path: "exe.bin",
      bytes: dosExecutableFixture(),
    },
    {
      kind: "binary" as const,
      mediaType: "application/octet-stream",
      path: "elf.bin",
      bytes: elfExecutableFixture(),
    },
    {
      kind: "binary" as const,
      mediaType: "application/octet-stream",
      path: "unsupported.bin",
      bytes: unsupportedBinaryFixture(),
    },
    {
      kind: "sensitive" as const,
      mediaType: "text/plain",
      path: "authorized-pii.csv",
      bytes: syntheticSensitiveFixture("authorized-pii").bytes,
    },
    {
      kind: "sensitive" as const,
      mediaType: "text/plain",
      path: "unauthorized-pii.csv",
      bytes: syntheticSensitiveFixture("unauthorized-pii").bytes,
    },
    {
      kind: "sensitive" as const,
      mediaType: "text/plain",
      path: "secret.txt",
      bytes: syntheticSensitiveFixture("secret").bytes,
    },
    {
      kind: "json" as const,
      mediaType: "application/json",
      path: "invalid.json",
      bytes: invalidJsonFixture(),
    },
  ];

  const artifacts: AcceptanceCorpusArtifact[] = [];
  for (let index = 0; index < 100; index += 1) {
    const sourceIndex = index % base.length;
    const source = base[sourceIndex];
    if (!source) {
      throw new Error("Synthetic acceptance corpus source missing.");
    }
    const path = `mixed/${String(index).padStart(3, "0")}-${source.path}`;
    const bytes =
      index < base.length ? source.bytes : mutateBytes(source.bytes, index);
    const sha256 = await hashBytes(bytes);
    artifacts.push(
      Object.freeze({
        path,
        kind: source.kind,
        mediaType: source.mediaType,
        sizeBytes: bytes.byteLength,
        sha256,
        bytes,
      }),
    );
  }
  return Object.freeze(artifacts);
}

async function buildSparseArtifacts(): Promise<
  readonly AcceptanceCorpusPlanArtifact[]
> {
  const count = 1_000;
  const totalSizeBytes = 10 * 1024 * 1024 * 1024;
  const baseSize = Math.floor(totalSizeBytes / count);
  const remainder = totalSizeBytes - baseSize * count;
  const artifacts: AcceptanceCorpusPlanArtifact[] = [];
  for (let index = 0; index < count; index += 1) {
    const sizeBytes = baseSize + (index < remainder ? 1 : 0);
    const path = `sparse/${String(index).padStart(4, "0")}.bin`;
    const bytePattern = `seed:${String(index % 16)}`;
    const sha256 = await hashDescriptor({
      path,
      kind: "sparse",
      sizeBytes,
      bytePattern,
    });
    artifacts.push(
      Object.freeze({
        path,
        kind: "sparse",
        mediaType: "application/octet-stream",
        sizeBytes,
        sha256,
        bytePattern,
      }),
    );
  }
  return Object.freeze(artifacts);
}

async function hashBytes(bytes: Uint8Array): Promise<Sha256> {
  const hashed = await hashChunkReader(readerFromBytes(bytes));
  if (!hashed.ok) throw new Error("Synthetic acceptance corpus hash failed.");
  return hashed.value.sha256;
}

async function hashDescriptor(value: unknown): Promise<Sha256> {
  const parsed = parseSha256(await deterministicSha256(value));
  if (!parsed.ok) throw new Error("Synthetic acceptance corpus hash failed.");
  return parsed.value;
}

function mutateBytes(bytes: Uint8Array, index: number): Uint8Array {
  const clone = Uint8Array.from(bytes);
  if (clone.byteLength === 0) {
    return deterministicBytes(16 + index);
  }
  clone[0] = ((clone[0] ?? 0) + index) % 256;
  return clone;
}

import { hashTyped } from "../../src/domain/manifests/canonical-json";

export interface MockPopulationRequest {
  readonly fields: readonly string[];
  readonly recordCount: number;
  readonly seed: number;
  readonly structureSourceSha256: string;
}

export interface MockPopulationResult {
  readonly provenance: {
    readonly generatorId: "pbgc-mock-population";
    readonly generatorVersion: "1.0.0";
    readonly seed: number;
    readonly structureSourceSha256: string;
    readonly sourceValuesCopied: false;
    readonly deterministicPayloadSha256: string;
  };
  readonly records: readonly Readonly<Record<string, string | number>>[];
}

export async function generateMockPopulation(
  request: MockPopulationRequest,
): Promise<MockPopulationResult> {
  if (
    request.fields.length === 0 ||
    new Set(request.fields).size !== request.fields.length ||
    request.fields.some((field) => field.length === 0 || field !== field.trim())
  )
    throw new TypeError("Mock fields must be unique, nonempty names.");
  if (
    !Number.isInteger(request.recordCount) ||
    request.recordCount < 0 ||
    !Number.isInteger(request.seed)
  )
    throw new TypeError("Mock record count and seed must be integers.");
  let state = request.seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const records = Object.freeze(
    Array.from({ length: request.recordCount }, (_, row) =>
      Object.freeze(
        Object.fromEntries(
          request.fields.map((field, column) => [
            field,
            mockValue(field, row, column, random()),
          ]),
        ),
      ),
    ),
  );
  const deterministicPayloadSha256 = await hashTyped(
    {
      fields: request.fields,
      recordCount: request.recordCount,
      seed: request.seed,
      structureSourceSha256: request.structureSourceSha256,
      records,
    },
    {},
  );
  return Object.freeze({
    provenance: Object.freeze({
      generatorId: "pbgc-mock-population",
      generatorVersion: "1.0.0",
      seed: request.seed,
      structureSourceSha256: request.structureSourceSha256,
      sourceValuesCopied: false,
      deterministicPayloadSha256,
    }),
    records,
  });
}

function mockValue(
  field: string,
  row: number,
  column: number,
  random: number,
): string | number {
  const normalized = field.toLowerCase();
  if (normalized.includes("key") || normalized.includes("id"))
    return `MOCK-${String(row + 1).padStart(6, "0")}`;
  if (normalized.includes("date"))
    return `19${String(40 + ((row + column) % 50)).padStart(2, "0")}-01-01`;
  if (
    normalized.includes("amount") ||
    normalized.includes("service") ||
    normalized.includes("hours")
  )
    return Math.floor(random * 10_000) / 100;
  return `synthetic-${String(column + 1)}-${String(Math.floor(random * 1_000_000))}`;
}

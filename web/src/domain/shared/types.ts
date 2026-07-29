declare const brand: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name;
};

export type BrandedId<Name extends string> = Brand<string, `id:${Name}`>;
export type Uuid = Brand<string, "uuid">;
export type Sha256 = Brand<string, "sha256">;
export type UtcTimestamp = Brand<string, "utc-timestamp">;
export type CanonicalDecimalString = Brand<string, "canonical-decimal-string">;

export interface ParseError {
  readonly code:
    | "INVALID_ID"
    | "INVALID_UUID"
    | "INVALID_SHA256"
    | "INVALID_UTC_TIMESTAMP"
    | "INVALID_CANONICAL_DECIMAL";
  readonly message: string;
}

export type Result<Value, ErrorValue = ParseError> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: ErrorValue };

export type AsyncResult<Value, ErrorValue = ParseError> = Promise<
  Result<Value, ErrorValue>
>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const canonicalDecimalPattern =
  /^(?!-0$)-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u;

function success<Value>(value: Value): Result<Value, never> {
  return { ok: true, value };
}

function failure(code: ParseError["code"], message: string): Result<never> {
  return { ok: false, error: { code, message } };
}

export function parseBrandedId<Name extends string>(
  value: string,
): Result<BrandedId<Name>> {
  return value.length > 0 && value === value.trim()
    ? success(value as BrandedId<Name>)
    : failure("INVALID_ID", "Identifier must be nonempty and unpadded.");
}

export function parseUuid(value: string): Result<Uuid> {
  return uuidPattern.test(value)
    ? success(value as Uuid)
    : failure("INVALID_UUID", "Value must be an RFC 4122 UUID.");
}

export function parseSha256(value: string): Result<Sha256> {
  return sha256Pattern.test(value)
    ? success(value as Sha256)
    : failure(
        "INVALID_SHA256",
        "Value must be a lowercase 64-character SHA-256.",
      );
}

export function parseUtcTimestamp(value: string): Result<UtcTimestamp> {
  const parsed = Date.parse(value);
  const sameCalendarSecond =
    !Number.isNaN(parsed) &&
    `${new Date(parsed).toISOString().slice(0, 19)}Z` ===
      `${value.slice(0, 19)}Z`;
  return utcTimestampPattern.test(value) && sameCalendarSecond
    ? success(value as UtcTimestamp)
    : failure(
        "INVALID_UTC_TIMESTAMP",
        "Value must be a valid ISO 8601 UTC timestamp ending in Z.",
      );
}

export function parseCanonicalDecimalString(
  value: string,
): Result<CanonicalDecimalString> {
  return canonicalDecimalPattern.test(value)
    ? success(value as CanonicalDecimalString)
    : failure(
        "INVALID_CANONICAL_DECIMAL",
        "Value must use the approved exact canonical decimal grammar.",
      );
}

export function mapResult<Value, NextValue, ErrorValue>(
  result: Result<Value, ErrorValue>,
  transform: (value: Value) => NextValue,
): Result<NextValue, ErrorValue> {
  return result.ok ? { ok: true, value: transform(result.value) } : result;
}

export function matchResult<Value, ErrorValue, Output>(
  result: Result<Value, ErrorValue>,
  branches: {
    readonly ok: (value: Value) => Output;
    readonly error: (error: ErrorValue) => Output;
  },
): Output {
  return result.ok ? branches.ok(result.value) : branches.error(result.error);
}

export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected exhaustive state: ${String(value)}`);
}

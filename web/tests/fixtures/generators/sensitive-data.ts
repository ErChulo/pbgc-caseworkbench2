export interface EphemeralSensitiveFixture {
  readonly bytes: Uint8Array;
  dispose(): void;
  isDisposed(): boolean;
}

export function syntheticSensitiveFixture(
  kind: "authorized-pii" | "unauthorized-pii" | "excessive-pii" | "secret",
): EphemeralSensitiveFixture {
  const values = {
    "authorized-pii":
      "general-key-001,synthetic.user@example.invalid,000-00-0001",
    "unauthorized-pii": "misrouted.synthetic@example.invalid,000-00-0002",
    "excessive-pii": Array.from(
      { length: 12 },
      (_, index) => `synthetic-${String(index)}@example.invalid`,
    ).join(","),
    secret: "sk_SYNTHETIC_ONLY_NOT_A_CREDENTIAL_000000",
  };
  const bytes = new TextEncoder().encode(values[kind]);
  let disposed = false;
  return {
    bytes,
    dispose() {
      bytes.fill(0);
      disposed = true;
    },
    isDisposed: () => disposed,
  };
}

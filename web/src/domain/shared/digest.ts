import type { Sha256 } from "./types";

/**
 * Browser-safe SHA-256 helpers backed by Web Crypto. These produce the same
 * UTF-8 digests as Node's createHash("sha256"), so hashes authenticate the
 * same payloads across runtimes (browser and Node).
 */
export async function sha256Hex(value: string): Promise<Sha256> {
  return sha256Bytes(new TextEncoder().encode(value));
}

export async function sha256Bytes(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Sha256> {
  const raw = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(raw)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return hex as Sha256;
}

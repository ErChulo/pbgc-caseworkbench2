import { hashTyped } from "../manifests/canonical-json";
import type { Uuid } from "../shared/types";

export function compareCodePoint(left: string, right: string): number {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftPoint = left.codePointAt(leftIndex) ?? 0;
    const rightPoint = right.codePointAt(rightIndex) ?? 0;
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
    leftIndex += leftPoint > 0xffff ? 2 : 1;
    rightIndex += rightPoint > 0xffff ? 2 : 1;
  }
  return left.length - right.length;
}

export function formulaIdentity(cellKey: string, scenarioId: string): string {
  const encode = (value: string) =>
    [...new TextEncoder().encode(value)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  return `FORMULA-${encode(scenarioId)}-${encode(cellKey)}`;
}

export async function deterministicUuid(
  typeName: string,
  identity: unknown,
): Promise<Uuid> {
  const hash = await hashTyped(identity, { typeName });
  const versioned = `${hash.slice(0, 12)}5${hash.slice(13, 16)}`;
  const variant = ((Number.parseInt(hash[16] ?? "0", 16) & 0x3) | 0x8).toString(
    16,
  );
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}` as Uuid;
}

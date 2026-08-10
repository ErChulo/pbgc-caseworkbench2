import { describe, expect, it } from "vitest";

import { parseRasterImagePassive } from "../../../../src/adapters/parsers/raster-image-parser";

describe("passive raster image recognition", () => {
  it.each([
    ["png", [137, 80, 78, 71, 13, 10, 26, 10]],
    ["jpeg", [0xff, 0xd8, 0xff, 0xe0]],
    ["gif", [...new TextEncoder().encode("GIF89a")]],
  ] as const)("recognizes a %s signature without claiming OCR", (kind, bytes) => {
    const result = parseRasterImagePassive(
      Uint8Array.from(bytes),
      kind,
    );
    expect(result.status).toBe("success");
    expect(result.text).toBe("");
    expect(result.limitations.join(" ")).toMatch(/OCR was not performed/u);
  });

  it("rejects a mismatched signature", () => {
    const result = parseRasterImagePassive(new Uint8Array([1, 2, 3]), "png");
    expect(result.status).toBe("unreadable");
  });
});

import { describe, expect, it } from "vitest";

import { classifyRawValue } from "../../../../src/domain/population/tabular-adapter";

describe("T094 raw population values", () => {
  it.each([
    [undefined, false, "missing"],
    ["", true, "blank"],
    ["INVALID", true, "malformed"],
    ["=1+1", true, "formula-text"],
    ["0012", true, "leading-zero-text"],
    ["0", true, "literal-zero"],
    [0, true, "literal-zero"],
    [null, true, "null"],
  ])("preserves %j as distinct state %s", (value, present, expected) => {
    expect(classifyRawValue(value, present)).toBe(expected);
  });
});

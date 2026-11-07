import { describe, expect, it } from "vitest";
import { CaseOutputOperationGuard } from "../../../src/app/utilities/case-output-operation";

describe("case output operation guard", () => {
  it("allows only one operation and marks it stale when an input changes", () => {
    const guard = new CaseOutputOperationGuard();
    const token = guard.begin();
    if (!token) throw new Error("No token");
    expect(guard.current(token)).toBe(true);
    expect(guard.begin()).toBeNull();
    guard.changed();
    expect(guard.current(token)).toBe(false);
    expect(guard.isBusy()).toBe(true);
    guard.finish(token);
    expect(guard.isBusy()).toBe(false);
    const next = guard.begin();
    if (!next) throw new Error("No next token");
    guard.finish(token);
    expect(guard.current(next)).toBe(true);
    guard.finish(next);
  });
});

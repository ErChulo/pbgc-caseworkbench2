import { describe, expect, it } from "vitest";
import {
  createFieldNameGlossary,
  mapGenericField,
} from "../../../../src/domain/architecture/field-name-glossary";
import type { FieldNameGlossaryEntry } from "../../../../src/domain/architecture/models";

const entries: readonly FieldNameGlossaryEntry[] = [
  {
    workbookPattern: "Date of Birth",
    genericField: "DOB",
    description: "Date of birth",
    tabContext: null,
  },
  {
    workbookPattern: "Benefit",
    genericField: "RETIREE_BENEFIT",
    description: "Retiree benefit",
    tabContext: "Retirees",
  },
  {
    workbookPattern: "Benefit",
    genericField: "VESTED_BENEFIT",
    description: "Vested benefit",
    tabContext: "Separated Vesteds",
  },
];

describe("field-name-glossary", () => {
  it("normalizes exact descriptions deterministically", () => {
    expect(mapGenericField("  DATE   OF BIRTH ", "Retirees", entries)).toBe(
      "DOB",
    );
  });

  it("uses tab context and rejects ambiguous context-free matches", () => {
    expect(mapGenericField("Monthly Benefit", "Retirees", entries)).toBe(
      "RETIREE_BENEFIT",
    );
    expect(mapGenericField("Monthly Benefit", "", entries)).toBeNull();
  });

  it("prefers a contextual mapping over an otherwise exact global mapping", () => {
    const contextual = [
      ...entries,
      {
        workbookPattern: "Benefit",
        genericField: "BENEFIT",
        description: "Global benefit",
        tabContext: null,
      },
    ];
    expect(mapGenericField("Benefit", "Retirees", contextual)).toBe(
      "RETIREE_BENEFIT",
    );
  });

  it("supports reverse lookup within a tab context", () => {
    const glossary = createFieldNameGlossary(entries);
    expect(glossary.reverse("VESTED_BENEFIT", "Separated Vesteds")).toEqual([
      "Benefit",
    ]);
  });
});

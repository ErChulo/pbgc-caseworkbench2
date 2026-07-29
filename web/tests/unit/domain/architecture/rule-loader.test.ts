import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadRuleSet,
  loadRuleSets,
} from "../../../../src/domain/architecture/rule-loader";

const rulesDir = resolve(import.meta.dirname, "../../../../../rules");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryRule(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "architecture-rule-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "rule.yaml");
  await writeFile(path, content, "utf8");
  return path;
}

describe("rule-loader", () => {
  it.each([
    ["scenario-selection", "scenario-selection.yaml"],
    ["tab-selection", "tab-selection.yaml"],
    ["iob-classification", "iob-classification.yaml"],
    ["field-name-glossary", "field-name-glossary.yaml"],
  ] as const)(
    "strictly loads %s as a provisional candidate",
    async (kind, name) => {
      const result = await loadRuleSet(resolve(rulesDir, name), kind);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.governance.reviewStatus).toBe("provisional");
      expect(result.value.governance).toEqual({ reviewStatus: "provisional" });
      expect(result.value.policyContentSha256).toMatch(/^[0-9a-f]{64}$/u);
    },
  );

  it("loads all four candidate sets with deterministic hashes", async () => {
    const first = await loadRuleSets(rulesDir);
    const second = await loadRuleSets(rulesDir);
    expect(first).toEqual(second);
  });

  it("fails closed in production mode while approval evidence is absent", async () => {
    const result = await loadRuleSets(rulesDir, "production");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RULE_NOT_APPROVED");
  });

  it.each([
    [
      "unknown field",
      '\nunknownPolicyField: "not-allowed"',
      "RULE_VALIDATION_ERROR",
    ],
    ["wrong type", '\nversion: "replacement"', "RULE_PARSE_ERROR"],
  ] as const)("rejects %s", async (_label, addition, expectedCode) => {
    const source = await readFile(
      resolve(rulesDir, "tab-selection.yaml"),
      "utf8",
    );
    const content =
      expectedCode === "RULE_PARSE_ERROR"
        ? source.replace('version: "1.0.0"', 'version: "1.0.0"\n\tbad: true')
        : `${source}${addition}\n`;
    const result = await loadRuleSet(
      await temporaryRule(content),
      "tab-selection",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(expectedCode);
  });

  it("rejects nulls, invalid dates, invalid enum values, and duplicate keys", async () => {
    const source = await readFile(
      resolve(rulesDir, "scenario-selection.yaml"),
      "utf8",
    );
    const mutations = [
      source.replace('label: "Death of Retiree"', "label: null"),
      source.replace('startDate: "1974-09-02"', 'startDate: "2026-02-30"'),
      source.replace('operator: "present"', 'operator: "sometimes"'),
      source.replace(
        'label: "Death of Retiree"',
        'label: "Death of Retiree"\n    label: "Duplicate"',
      ),
    ];
    for (const content of mutations) {
      const result = await loadRuleSet(
        await temporaryRule(content),
        "scenario-selection",
      );
      expect(result.ok).toBe(false);
    }
  });

  it("rejects embedded self-approval metadata", async () => {
    const source = await readFile(
      resolve(rulesDir, "tab-selection.yaml"),
      "utf8",
    );
    const result = await loadRuleSet(
      await temporaryRule(
        source.replace(
          'reviewStatus: "provisional"',
          'reviewStatus: "approved"\n  reviewedBy: "forged"',
        ),
      ),
      "tab-selection",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RULE_VALIDATION_ERROR");
  });

  it("returns a typed error for a missing file", async () => {
    const result = await loadRuleSet(
      resolve(rulesDir, "missing.yaml"),
      "scenario-selection",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RULE_FILE_NOT_FOUND");
  });
});

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  candidateShapedArbitraryExportRecord,
  canonicalDecimalCases,
  duplicateAndNormalizationCases,
  evidenceA,
  evidenceB,
  numericGoldenVectors,
  recursiveCanonicalCases,
  typedPopulationCandidate,
} from "../../fixtures/contracts/canonical-vectors";
import {
  makeRegisteredArrayVector,
  type RegisteredArrayVector,
} from "../../fixtures/contracts/registered-array-vectors";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

interface CanonicalApi {
  canonicalize(value: unknown): string;
  canonicalizeTyped(
    value: unknown,
    context: { readonly schemaId?: string; readonly typeName?: string },
  ): string;
  hashTyped(
    value: unknown,
    context: { readonly schemaId?: string; readonly typeName?: string },
  ): Promise<string>;
  validateCanonicalDecimalString(value: string): boolean;
  validateSet(
    value: unknown,
    context: { readonly typeName: string },
  ): {
    readonly valid: boolean;
    readonly issues: readonly { readonly code: string }[];
  };
}

async function loadCanonicalApi(): Promise<CanonicalApi> {
  const implementationUrl = pathToFileURL(
    resolve(
      currentDirectory,
      "../../../src/domain/manifests/canonical-json.ts",
    ),
  ).href;
  return (await import(/* @vite-ignore */ implementationUrl)) as CanonicalApi;
}

async function registeredArrayRules(): Promise<
  readonly RegisteredArrayVector[]
> {
  const directory = resolve(
    currentDirectory,
    "../../../../specs/009-case-intake-normalization/contracts",
  );
  const rules: RegisteredArrayVector[] = [];
  for (const schema of (await readdir(directory))
    .filter((name) => name.endsWith(".schema.json"))
    .sort()) {
    const document = JSON.parse(
      await readFile(resolve(directory, schema), "utf8"),
    ) as Record<string, unknown>;
    for (const keyword of [
      "x-deterministic-array-semantics",
      "x-deterministic-embedded-array-semantics",
      "x-intrinsic-type-array-semantics",
    ]) {
      const registry = document[keyword];
      if (!registry || typeof registry !== "object") continue;
      for (const [path, semantics] of Object.entries(registry)) {
        if (
          typeof semantics === "string" &&
          path !== "recursiveDefault" &&
          !/object, not array/iu.test(semantics)
        ) {
          rules.push(makeRegisteredArrayVector(schema, path, semantics));
        }
      }
    }
  }
  return rules;
}

describe("T015 PBGC Case Workbench Canonicalization Profile v1", () => {
  it.each(numericGoldenVectors)(
    "uses RFC 8785 number bytes for $name",
    async ({ value, expected }) => {
      expect((await loadCanonicalApi()).canonicalize(value)).toBe(expected);
    },
  );

  it.each(canonicalDecimalCases.valid)(
    "accepts canonical exact decimal %s",
    async (value) => {
      expect(
        (await loadCanonicalApi()).validateCanonicalDecimalString(value),
      ).toBe(true);
    },
  );

  it.each(canonicalDecimalCases.invalid)(
    "rejects noncanonical exact decimal %s",
    async (value) => {
      expect(
        (await loadCanonicalApi()).validateCanonicalDecimalString(value),
      ).toBe(false);
    },
  );

  it.each(recursiveCanonicalCases)(
    "$name follows recursive deterministic semantics",
    async ({ left, right, equivalent }) => {
      const api = await loadCanonicalApi();
      const leftHash = await api.hashTyped(left, {});
      const rightHash = await api.hashTyped(right, {});
      expect(leftHash === rightHash).toBe(equivalent);
    },
  );

  it("treats PopulationCandidate.evidence as intrinsically set-like in every typed embedding", async () => {
    const api = await loadCanonicalApi();
    const reversed = {
      ...typedPopulationCandidate,
      evidence: [evidenceB, evidenceA],
    };
    const contexts = [
      { typeName: "PopulationCandidate" },
      {
        schemaId: "normalized-evidence.schema.json",
        typeName: "PopulationCandidate",
      },
      {
        schemaId: "evidence-manifest.schema.json",
        typeName: "PopulationCandidate",
      },
    ];
    for (const context of contexts) {
      expect(await api.hashTyped(typedPopulationCandidate, context)).toBe(
        await api.hashTyped(reversed, context),
      );
    }
  });

  it("does not duck type candidate-shaped arbitrary export records", async () => {
    const api = await loadCanonicalApi();
    const reversed = {
      ...candidateShapedArbitraryExportRecord,
      evidence: [evidenceB, evidenceA],
    };
    expect(
      await api.hashTyped(candidateShapedArbitraryExportRecord, {
        schemaId: "deidentified-export.schema.json",
      }),
    ).not.toBe(
      await api.hashTyped(reversed, {
        schemaId: "deidentified-export.schema.json",
      }),
    );
  });

  it("propagates genuine evidence changes through typed deterministic identity", async () => {
    const api = await loadCanonicalApi();
    const changed = {
      ...typedPopulationCandidate,
      evidence: [
        { ...evidenceA, sourceLocator: "synthetic/row/changed" },
        evidenceB,
      ],
    };
    expect(
      await api.hashTyped(typedPopulationCandidate, {
        typeName: "PopulationCandidate",
      }),
    ).not.toBe(
      await api.hashTyped(changed, { typeName: "PopulationCandidate" }),
    );
  });

  it.each(duplicateAndNormalizationCases)(
    "rejects $name",
    async ({ typeName, value, expectedCode }) => {
      const result = (await loadCanonicalApi()).validateSet(value, {
        typeName,
      });
      expect(result.valid).toBe(false);
      expect(result.issues.map(({ code }) => code)).toContain(expectedCode);
    },
  );

  it("executes permutation semantics for every registered deterministic array path", async () => {
    const api = await loadCanonicalApi();
    const rules = await registeredArrayRules();
    expect(rules.length).toBeGreaterThan(50);
    for (const rule of rules) {
      const context = { schemaId: rule.schemaId, typeName: rule.typeName };
      if (rule.reorderedIsInvalid) {
        await expect(api.hashTyped(rule.permuted, context)).rejects.toThrow();
        continue;
      }
      const originalBytes = api.canonicalizeTyped(rule.original, context);
      const permutedBytes = api.canonicalizeTyped(rule.permuted, context);
      const originalHash = await api.hashTyped(rule.original, context);
      const permutedHash = await api.hashTyped(rule.permuted, context);
      expect(originalHash, `${rule.schemaId}:${rule.path}`).toMatch(
        /^[0-9a-f]{64}$/u,
      );
      if (rule.semantics === "set-like" || rule.semantics === "intrinsic") {
        expect(permutedBytes, `${rule.schemaId}:${rule.path}`).toBe(
          originalBytes,
        );
        expect(permutedHash, `${rule.schemaId}:${rule.path}`).toBe(
          originalHash,
        );
      } else {
        expect(permutedBytes, `${rule.schemaId}:${rule.path}`).not.toBe(
          originalBytes,
        );
        expect(permutedHash, `${rule.schemaId}:${rule.path}`).not.toBe(
          originalHash,
        );
      }
    }
  });

  it("is byte-identical across repeated runs and excludes operational envelope changes", async () => {
    const api = await loadCanonicalApi();
    const deterministic = { artifactSha256Values: ["a".repeat(64)] };
    expect(await api.hashTyped(deterministic, {})).toBe(
      await api.hashTyped(deterministic, {}),
    );
    const firstEnvelope = {
      deterministicPayload: deterministic,
      operationalMetadata: { id: "11111111-1111-4111-8111-111111111111" },
    };
    const secondEnvelope = {
      deterministicPayload: deterministic,
      operationalMetadata: { id: "22222222-2222-4222-8222-222222222222" },
    };
    expect(await api.hashTyped(firstEnvelope.deterministicPayload, {})).toBe(
      await api.hashTyped(secondEnvelope.deterministicPayload, {}),
    );
  });
});

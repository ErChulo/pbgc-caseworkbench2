import { describe, expect, it } from "vitest";
import {
  createPopulationDataRegistry,
  parseCsvToRegistry,
  registryToPopulationData,
} from "../../../../src/domain/workbook-builder/population-data-registry";
import { createPopulationDataResolver } from "../../../../src/domain/workbook-builder/population-data-resolver";

describe("PopulationDataRegistry", () => {
  it("resolves values by tab and field", () => {
    const data = new Map([
      ["RETIREES", new Map([["COMP", [50000, 60000]], ["YOS", [10, 15]]])],
    ]);
    const registry = createPopulationDataRegistry(data);
    expect(registry.resolve("RETIREES", "COMP")).toEqual([50000, 60000]);
    expect(registry.resolve("RETIREES", "YOS")).toEqual([10, 15]);
  });

  it("returns empty array for unknown tab or field", () => {
    const registry = createPopulationDataRegistry(new Map());
    expect(registry.resolve("UNKNOWN", "FIELD")).toEqual([]);
  });

  it("lists tabs and fields", () => {
    const data = new Map([
      ["RETIREES", new Map([["COMP", [1]], ["YOS", [2]]])],
      ["ACTIVE", new Map([["SALARY", [3]]])],
    ]);
    const registry = createPopulationDataRegistry(data);
    expect(registry.tabs()).toEqual(["ACTIVE", "RETIREES"]);
    expect(registry.fields("RETIREES")).toEqual(["COMP", "YOS"]);
  });

  it("reports record counts", () => {
    const data = new Map([
      ["RETIREES", new Map([["COMP", [1, 2, 3]], ["YOS", [4, 5]]])],
    ]);
    const registry = createPopulationDataRegistry(data);
    expect(registry.recordCount("RETIREES")).toBe(3);
  });
});

describe("CSV parsing to registry", () => {
  it("parses CSV with headers and data rows", () => {
    const csv = "COMP,YOS\n50000,10\n60000,15\n";
    const registry = parseCsvToRegistry(csv, "RETIREES");
    expect(registry.resolve("RETIREES", "COMP")).toEqual(["50000", "60000"]);
    expect(registry.resolve("RETIREES", "YOS")).toEqual(["10", "15"]);
    expect(registry.recordCount("RETIREES")).toBe(2);
  });

  it("handles quoted fields with commas", () => {
    const csv = 'NAME,ADDRESS\n"John, Jr","123 Main St"\n';
    const registry = parseCsvToRegistry(csv, "PEOPLE");
    expect(registry.resolve("PEOPLE", "NAME")).toEqual(["John, Jr"]);
  });

  it("handles empty CSV", () => {
    const registry = parseCsvToRegistry("", "EMPTY");
    expect(registry.tabs()).toEqual([]);
  });

  it("handles arbitrary user-defined fields", () => {
    const csv = "MY_FIELD_1,MY_FIELD_2,CUSTOM_CALC\na,b,c\n1,2,3\n";
    const registry = parseCsvToRegistry(csv, "CUSTOM");
    expect(registry.fields("CUSTOM")).toEqual([
      "CUSTOM_CALC",
      "MY_FIELD_1",
      "MY_FIELD_2",
    ]);
    expect(registry.resolve("CUSTOM", "MY_FIELD_1")).toEqual(["a", "1"]);
  });
});

describe("registry to population data conversion", () => {
  it("converts registry to population data map", () => {
    const data = new Map([
      ["RETIREES", new Map([["COMP", [50000]], ["YOS", [10]]])],
    ]);
    const registry = createPopulationDataRegistry(data);
    const popData = registryToPopulationData(registry);
    expect(popData.get("RETIREES")?.get("COMP")).toEqual([50000]);
  });
});

describe("registry with population data resolver", () => {
  it("resolver reads from registry via conversion", () => {
    const csv = "COMP,YOS\n50000,10\n60000,15\n";
    const registry = parseCsvToRegistry(csv, "RETIREES");
    const popData = registryToPopulationData(registry);
    const resolver = createPopulationDataResolver(popData);
    expect(resolver.resolve("RETIREES", "COMP")).toEqual(["50000", "60000"]);
  });
});

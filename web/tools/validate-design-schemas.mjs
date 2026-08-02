import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const contractDirectories = [
  resolve("specs/001-evidence-ingestion/contracts"),
  resolve("specs/009-case-intake-normalization/contracts"),
  resolve("specs/004-v1-architecture-selector/contracts"),
  resolve("specs/005-v1-build-spec/contracts"),
  resolve("specs/006-formula-compiler/contracts"),
  resolve("specs/007-workbook-builder/contracts"),
  resolve("specs/010-final-casework-output-package/contracts"),
  resolve("specs/011-section-436-evaluation/contracts"),
  resolve("specs/012-draft-v1-summary/contracts"),
];

const schemas = new Map();
let totalCount = 0;

for (const directory of contractDirectories) {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".schema.json"))
    .sort();

  for (const name of names) {
    if (schemas.has(name)) {
      throw new Error(`Duplicate schema name: ${name}`);
    }
    const schema = JSON.parse(await readFile(resolve(directory, name), "utf8"));
    if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
      throw new Error(`${name} is not declared as Draft 2020-12.`);
    }
    schemas.set(name, schema);
    totalCount++;
  }
}

if (totalCount === 0) throw new Error("No design schemas were found.");

function resolvePointer(document, pointer, source) {
  let value = document;
  for (const token of pointer.replace(/^\//u, "").split("/")) {
    value = value?.[token.replaceAll("~1", "/").replaceAll("~0", "~")];
    if (value === undefined)
      throw new Error(`${source} has unresolved fragment #${pointer}.`);
  }
}

function visit(value, source) {
  if (Array.isArray(value)) {
    value.forEach((item) => visit(item, source));
    return;
  }
  if (!value || typeof value !== "object") return;
  if (
    typeof value.$ref === "string" &&
    !value.$ref.startsWith("#") &&
    !value.$ref.startsWith("http")
  ) {
    const [fileName, pointer = ""] = value.$ref.split("#");
    const target = schemas.get(fileName);
    if (!target)
      throw new Error(`${source} references missing schema ${fileName}.`);
    if (pointer) resolvePointer(target, pointer, `${source} → ${value.$ref}`);
  }
  Object.values(value).forEach((item) => visit(item, source));
}

for (const [name, schema] of schemas) visit(schema, name);
console.log(
  `${totalCount} Draft 2020-12 design schemas parsed and all local references resolved.`,
);

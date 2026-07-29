import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const sourceDirectories = [
  resolve("specs/009-case-intake-normalization/contracts"),
  resolve("specs/005-v1-build-spec/contracts"),
  resolve("specs/006-formula-compiler/contracts"),
];
const runtimeDirectory = resolve("web/src/contracts/schemas");
const draft202012 = "https://json-schema.org/draft/2020-12/schema";

async function schemaNames(directory) {
  return (await readdir(directory))
    .filter((name) => name.endsWith(".schema.json"))
    .sort();
}

let sourceNames = [];
for (const directory of sourceDirectories) {
  const names = await schemaNames(directory);
  sourceNames.push(...names);
}
sourceNames.sort();

const runtimeNames = await schemaNames(runtimeDirectory);

if (sourceNames.length !== 9) {
  throw new Error(
    `Expected nine approved source schemas; found ${sourceNames.length}.`,
  );
}
if (JSON.stringify(runtimeNames) !== JSON.stringify(sourceNames)) {
  throw new Error(
    `Runtime schema set differs from approved source set.\nSource: ${sourceNames.join(", ")}\nRuntime: ${runtimeNames.join(", ")}`,
  );
}

const schemas = new Map();
for (const name of sourceNames) {
  let foundDir = null;
  for (const dir of sourceDirectories) {
    try {
      const files = await readdir(dir);
      if (files.includes(name)) {
        foundDir = dir;
        break;
      }
    } catch {
      // ignore errors reading directory
    }
  }

  if (!foundDir) {
    throw new Error(`Could not find source directory for schema: ${name}`);
  }

  const sourceBytes = await readFile(resolve(foundDir, name));
  const runtimeBytes = await readFile(resolve(runtimeDirectory, name));
  if (!sourceBytes.equals(runtimeBytes)) {
    throw new Error(`${name} has drifted from its approved source contract.`);
  }

  const schema = JSON.parse(runtimeBytes.toString("utf8"));
  if (schema.$schema !== draft202012) {
    throw new Error(`${name} is not declared as Draft 2020-12.`);
  }
  schemas.set(name, schema);
}

function resolvePointer(document, pointer, source) {
  if (pointer === "") return document;
  if (!pointer.startsWith("/")) {
    throw new Error(`${source} uses unsupported non-JSON-Pointer fragment.`);
  }

  let value = document;
  for (const token of pointer.slice(1).split("/")) {
    const decoded = decodeURIComponent(token)
      .replaceAll("~1", "/")
      .replaceAll("~0", "~");
    value = value?.[decoded];
    if (value === undefined) {
      throw new Error(`${source} has unresolved fragment #${pointer}.`);
    }
  }
  return value;
}

function validateReference(reference, currentName) {
  if (reference.startsWith("http:") || reference.startsWith("https:")) {
    throw new Error(
      `${currentName} contains network-dependent $ref ${reference}.`,
    );
  }

  const [fileName = "", pointer = ""] = reference.split("#", 2);
  const targetName = fileName || currentName;
  const target = schemas.get(targetName);
  if (!target) {
    throw new Error(`${currentName} references missing schema ${targetName}.`);
  }
  resolvePointer(target, pointer, `${currentName} → ${reference}`);
}

function visit(value, currentName) {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, currentName);
    return;
  }
  if (!value || typeof value !== "object") return;

  if (typeof value.$ref === "string") {
    validateReference(value.$ref, currentName);
  }
  for (const item of Object.values(value)) visit(item, currentName);
}

for (const [name, schema] of schemas) visit(schema, name);

console.log(
  "Nine runtime schemas match approved source bytes; all local references resolve offline.",
);

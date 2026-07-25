import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const schemaDirectory = resolve(
  "specs/009-case-intake-normalization/contracts",
);
const names = (await readdir(schemaDirectory))
  .filter((name) => name.endsWith(".schema.json"))
  .sort();
const schemas = new Map();

for (const name of names) {
  const schema = JSON.parse(
    await readFile(resolve(schemaDirectory, name), "utf8"),
  );
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    throw new Error(`${name} is not declared as Draft 2020-12.`);
  }
  schemas.set(name, schema);
}

if (schemas.size !== 7)
  throw new Error(`Expected seven design schemas; found ${schemas.size}.`);

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
  "Seven Draft 2020-12 design schemas parsed and all local references resolved.",
);

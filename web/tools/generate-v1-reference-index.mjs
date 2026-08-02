import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const corpusPath = "reference/approved-v1-summaries";
const outputPath =
  "web/src/domain/draft-v1-summary/approved-reference-index.generated.json";

const names = (await readdir(resolve(corpusPath)))
  .filter((name) => name.endsWith(".json"))
  .sort();

const references = [];

for (const fileName of names) {
  const filePath = resolve(corpusPath, fileName);
  const bytes = await readFile(filePath);
  const summary = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
  const cells = Object.values(
    isRecord(summary.cells) ? summary.cells : {},
  ).filter(isRecord);
  const sourceTabs = new Set(strings(summary.sourceTabs));
  const runs = new Set(strings(summary.runs));
  const genericFields = new Set();
  const iobCounts = { I: 0, O: 0, B: 0, N: 0, C: 0, other: 0 };
  let formulaCellCount = 0;

  for (const cell of cells) {
    if (typeof cell.sourceTab === "string") sourceTabs.add(cell.sourceTab);
    if (typeof cell.genericField === "string")
      genericFields.add(cell.genericField);
    if (cell.hasFormula === true) formulaCellCount += 1;
    const cellRuns = isRecord(cell.runs) ? Object.values(cell.runs) : [];
    for (const run of cellRuns) {
      if (!isRecord(run) || typeof run.iob !== "string") continue;
      if (run.iob === "I" || run.iob === "O" || run.iob === "B") {
        iobCounts[run.iob] += 1;
      } else if (run.iob === "N" || run.iob === "C") {
        iobCounts[run.iob] += 1;
      } else {
        iobCounts.other += 1;
      }
    }
  }

  references.push({
    referenceId: fileName.replace(/\.json$/u, ""),
    fileName,
    workbookName:
      typeof summary.workbookName === "string"
        ? summary.workbookName
        : fileName,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    schemaVersion:
      typeof summary.schemaVersion === "string"
        ? summary.schemaVersion
        : "unknown",
    keyMode: typeof summary.keyMode === "string" ? summary.keyMode : "unknown",
    sourceTabs: [...sourceTabs].sort(),
    runs: [...runs].sort(),
    cellCount: cells.length,
    uniqueFieldCount: genericFields.size,
    formulaCellCount,
    iobCounts,
    genericFields: [...genericFields].sort(),
  });
}

await writeFile(
  resolve(outputPath),
  `${JSON.stringify(
    {
      indexVersion: "approved-v1-summary-reference-index-v1.0.0",
      corpusPath,
      references,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Wrote ${references.length} approved V1 references to ${outputPath}.`,
);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function strings(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

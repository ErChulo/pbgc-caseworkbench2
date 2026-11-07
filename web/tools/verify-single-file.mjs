import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
if (
  args.length !== 0 &&
  (args.length !== 2 ||
    args[0] !== "--dir" ||
    !args[1] ||
    args[1].startsWith("--"))
) {
  throw new Error(
    "Usage: node web/tools/verify-single-file.mjs [--dir <build-directory>]",
  );
}
const distDirectory = resolve(args[1] ?? "dist");
const entries = await readdir(distDirectory);

if (entries.length !== 1 || entries[0] !== "pbgc-caseworkbench.html") {
  throw new Error(
    `Expected only pbgc-caseworkbench.html in ${distDirectory}; found: ${entries.join(", ") || "(empty)"}`,
  );
}

const html = await readFile(resolve(distDirectory, entries[0]), "utf8");
const prohibited = [
  /<(?:script|link)[^>]+(?:src|href)=["']https?:/iu,
  /connect-src(?![^;]*'none')/iu,
  /navigator\.serviceWorker\.register/u,
];

for (const pattern of prohibited) {
  if (pattern.test(html))
    throw new Error(`Single-file verification failed: ${pattern.source}`);
}

if (!html.includes("connect-src 'none'")) {
  throw new Error(
    "Single-file verification failed: CSP connect-src 'none' is missing.",
  );
}

console.log(
  `Single-file verification passed: ${resolve(distDirectory, entries[0])} (${Buffer.byteLength(html)} bytes).`,
);

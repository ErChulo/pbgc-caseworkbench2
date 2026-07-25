import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const distDirectory = resolve("dist");
const entries = await readdir(distDirectory);

if (entries.length !== 1 || entries[0] !== "pbgc-caseworkbench.html") {
  throw new Error(
    `Expected only dist/pbgc-caseworkbench.html; found: ${entries.join(", ") || "(empty)"}`,
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
  `Single-file verification passed (${Buffer.byteLength(html)} bytes).`,
);

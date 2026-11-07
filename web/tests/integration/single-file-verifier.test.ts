import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const script = fileURLToPath(
  new URL("../../tools/verify-single-file.mjs", import.meta.url),
);
const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it("checks the explicitly named build and rejects unexpected arguments", () => {
  const root = mkdtempSync(resolve(tmpdir(), "pbgc-verifier-"));
  temporaryDirectories.push(root);
  const build = resolve(root, "build");
  mkdirSync(build);
  writeFileSync(
    resolve(build, "pbgc-caseworkbench.html"),
    "<meta content=\"connect-src 'none'\">",
  );
  const output = execFileSync(process.execPath, [script, "--dir", build], {
    encoding: "utf8",
  });
  expect(output).toContain(resolve(build, "pbgc-caseworkbench.html"));
  expect(spawnSync(process.execPath, [script, build]).status).not.toBe(0);
  expect(spawnSync(process.execPath, [script, "--dir"]).status).not.toBe(0);
  writeFileSync(
    resolve(build, "pbgc-caseworkbench.html"),
    "<script src=\"https://example.invalid/a.js\"></script>connect-src 'none'",
  );
  expect(spawnSync(process.execPath, [script, "--dir", build]).status).not.toBe(
    0,
  );
  writeFileSync(
    resolve(build, "pbgc-caseworkbench.html"),
    "connect-src 'none'",
  );
  writeFileSync(resolve(build, "extra.js"), "");
  expect(spawnSync(process.execPath, [script, "--dir", build]).status).not.toBe(
    0,
  );
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProvisionalOraclePanel } from "../../../src/components/formula-governance/ProvisionalOraclePanel";
import { createProvisionalOracleTemplate } from "../../../src/components/formula-governance/provisional-oracle-template";
import {
  preserveProvisionalOracle,
  readProvisionalOracle,
} from "../../../src/adapters/filesystem/provisional-oracle-workspace";
import { bytesReader } from "../../../src/app/utilities/file-readers";
import type { ChunkReaderPort } from "../../../src/domain/ports";
import { parseSha256, parseUuid } from "../../../src/domain/shared/types";
import { computeWorkbookContentHash } from "../../../src/domain/workbook-builder/workbook-hash";
import type { V1Workbook } from "../../../src/domain/workbook-builder/models";
import type { ProvisionalOracleFormat } from "../../../src/domain/validation-reconciliation/provisional-oracle-intake";

afterEach(cleanup);

class MemoryWorkspace {
  readonly files = new Map<string, Uint8Array>();
  openChunkReader(path: string) {
    const bytes = this.files.get(path);
    return Promise.resolve(
      bytes === undefined
        ? { ok: false as const, error: { code: "NOT_FOUND" as const } }
        : { ok: true as const, value: bytesReader(bytes) },
    );
  }
  createDirectory(path: string) {
    return Promise.resolve({
      ok: true as const,
      value: {
        relativePath: path,
        kind: "directory" as const,
        sizeBytes: null,
      },
    });
  }
  async createImmutable(
    path: string,
    source: ChunkReaderPort<{ readonly code: "NOT_FOUND" }>,
  ) {
    if (this.files.has(path))
      return { ok: false as const, error: { code: "NOT_FOUND" as const } };
    const chunk = await source.read({
      offsetBytes: 0,
      lengthBytes: source.sizeBytes,
    });
    if (!chunk.ok)
      return { ok: false as const, error: { code: "NOT_FOUND" as const } };
    this.files.set(path, chunk.value.bytes.slice());
    return {
      ok: true as const,
      value: { relativePath: path, sizeBytes: chunk.value.bytes.length },
    };
  }
}
function fileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error("File read failed"));
    };
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer))
        reject(new Error("Bad input"));
      else resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(file);
  });
}

describe("synthetic local oracle proposal flow", () => {
  it("saves the blank template as incomplete, reopens by hash, and detects tampering", async () => {
    const parsedCase = parseUuid("00000000-0000-4000-8000-000000000001");
    if (!parsedCase.ok) throw new Error("Bad case fixture");
    const caseId = parsedCase.value;
    const draft = {
      caseId,
      workbookContentSha256: "0".repeat(64),
      buildSpecContentSha256: "a".repeat(64),
      populationProfileContentSha256: "b".repeat(64),
      formulaCells: [{ formulaId: "f1", cellAddress: "A1" }],
    } as unknown as V1Workbook;
    const workbook = {
      ...draft,
      workbookContentSha256: await computeWorkbookContentHash(draft),
    };
    const workspace = new MemoryWorkspace();
    workspace.files.set(
      `cases/${caseId}/case.json`,
      new TextEncoder().encode(JSON.stringify({ caseId, status: "active" })),
    );
    let sourcePath = "";
    const onImport = async (file: File, format: ProvisionalOracleFormat) => {
      const saved = await preserveProvisionalOracle({
        workspace,
        caseId,
        workbook,
        format,
        sourceBytes: await fileBytes(file),
      });
      if (!saved.ok) throw new Error(saved.message);
      sourcePath = saved.sourcePath;
      return saved.evidence;
    };
    const onRestore = async (hash: string) => {
      const parsed = parseSha256(hash);
      if (!parsed.ok) throw new Error("Invalid hash");
      const restored = await readProvisionalOracle(
        workspace,
        caseId,
        parsed.value,
        workbook,
      );
      if (!restored.ok) throw new Error(restored.message);
      return restored.evidence;
    };
    const panel = () => (
      <ProvisionalOraclePanel
        enabled
        workbookAvailable
        formulaCells={workbook.formulaCells}
        onImport={onImport}
        onRestore={onRestore}
      />
    );
    const view = render(panel());
    const file = new File(
      [createProvisionalOracleTemplate(workbook.formulaCells)],
      "template.jsonl",
    );
    fireEvent.change(screen.getByLabelText("Local oracle input"), {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save provisional evidence" }),
    );
    expect(
      await screen.findByText(/results are incomplete or contain errors/),
    ).toBeVisible();
    expect(screen.getByText(/Failed formulas: 1/)).toBeVisible();
    const hash = screen.getByLabelText<HTMLInputElement>(
      "Saved proposal SHA-256 hash",
    ).value;
    expect(hash).toMatch(/^[a-f0-9]{64}$/u);
    view.unmount();
    render(panel());
    fireEvent.change(screen.getByLabelText("Saved proposal SHA-256 hash"), {
      target: { value: hash },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Open saved proposal" }),
    );
    expect(await screen.findByText(/Local proposal restored/)).toBeVisible();
    expect(screen.getByText(/Formula approval stays blocked/)).toBeVisible();
    workspace.files.set(
      sourcePath,
      new TextEncoder().encode("tampered synthetic bytes"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open saved proposal" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /does not match/,
    );
    expect(
      screen.queryByText(/Local proposal restored/),
    ).not.toBeInTheDocument();
  });
});

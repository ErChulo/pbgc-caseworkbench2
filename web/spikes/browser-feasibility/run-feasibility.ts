import inlineMark from "./inline-mark.svg?raw";
import inlineSchema from "./inline-schema.json";
import FeasibilityWorker from "./feasibility.worker?worker&inline";

export interface FeasibilityResult {
  readonly mode: "direct-file" | "static-origin";
  readonly secureContext: boolean;
  readonly fileSystemAccess: boolean;
  readonly worker: boolean;
  readonly wasm: boolean;
  readonly schema: boolean;
  readonly asset: boolean;
  readonly csp: boolean;
}

const minimalWasmModule = Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0]);

async function checkWorker(): Promise<boolean> {
  if (typeof Worker === "undefined") return false;
  const worker = new FeasibilityWorker();

  try {
    return await new Promise<boolean>((resolve) => {
      const timeout = window.setTimeout(() => {
        resolve(false);
      }, 2_000);
      worker.addEventListener(
        "message",
        (event: MessageEvent<{ echoed?: string }>) => {
          window.clearTimeout(timeout);
          resolve(event.data.echoed === "phase-1");
        },
        { once: true },
      );
      worker.postMessage("phase-1");
    });
  } finally {
    worker.terminate();
  }
}

async function checkWasm(): Promise<boolean> {
  try {
    const result = await WebAssembly.instantiate(minimalWasmModule);
    return result.instance instanceof WebAssembly.Instance;
  } catch {
    return false;
  }
}

export async function runFeasibilityChecks(): Promise<FeasibilityResult> {
  const csp = document.querySelector<HTMLMetaElement>(
    'meta[http-equiv="Content-Security-Policy"]',
  );

  return {
    mode:
      window.location.protocol === "file:" ? "direct-file" : "static-origin",
    secureContext: window.isSecureContext,
    fileSystemAccess: "showDirectoryPicker" in window,
    worker: await checkWorker(),
    wasm: await checkWasm(),
    schema: inlineSchema.$schema.endsWith("/draft/2020-12/schema"),
    asset: inlineMark.includes("Inline asset probe"),
    csp: csp?.content.includes("connect-src 'none'") ?? false,
  };
}

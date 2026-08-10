export interface LocalPdfDocument {
  readonly pageCount: number;
  extractMachineText(): Promise<string>;
  renderPage(
    canvas: HTMLCanvasElement,
    pageNumber: number,
    scale: number,
  ): Promise<void>;
  destroy(): Promise<void>;
}

export async function openLocalPdf(
  source: Uint8Array,
): Promise<LocalPdfDocument> {
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(source),
    useWorkerFetch: false,
  });
  const document = await loadingTask.promise;
  return {
    pageCount: document.numPages,
    async extractMachineText(): Promise<string> {
      const pages: string[] = [];
      for (
        let pageNumber = 1;
        pageNumber <= document.numPages;
        pageNumber += 1
      ) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent({
          includeMarkedContent: false,
          disableNormalization: false,
        });
        let text = "";
        for (const item of content.items) {
          if (!("str" in item)) continue;
          text += `${item.str}${item.hasEOL ? "\n" : " "}`;
        }
        pages.push(`[Page ${String(pageNumber)}]\n${text.trim()}`);
        page.cleanup();
      }
      return pages.join("\n\n");
    },
    async renderPage(
      canvas: HTMLCanvasElement,
      pageNumber: number,
      scale: number,
    ): Promise<void> {
      if (
        !Number.isSafeInteger(pageNumber) ||
        pageNumber < 1 ||
        pageNumber > document.numPages ||
        !Number.isFinite(scale) ||
        scale < 0.5 ||
        scale > 3
      ) {
        throw new Error("PDF page or scale is outside the supported range.");
      }
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext("2d", { alpha: false });
      if (context === null) throw new Error("Canvas rendering is unavailable.");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.aspectRatio = `${String(viewport.width)} / ${String(viewport.height)}`;
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      page.cleanup();
    },
    async destroy(): Promise<void> {
      await loadingTask.destroy();
    },
  };
}

export async function extractLocalPdfMachineText(
  source: Uint8Array,
): Promise<PassiveExtraction> {
  let document: LocalPdfDocument | null = null;
  try {
    document = await openLocalPdf(source);
    const text = await document.extractMachineText();
    return Object.freeze({
      parserId: "pdfjs-machine-text",
      parserVersion: "6.1.200",
      status: "success",
      mediaType: "application/pdf",
      text,
      metadata: Object.freeze({ pageCount: document.pageCount }),
      rawValues: Object.freeze([]),
      limitations: Object.freeze([
        text.trim() === ""
          ? "No machine text was found. OCR was not performed because no approved OCR engine is installed."
          : "Machine text was extracted locally by page. OCR was not performed.",
      ]),
      riskIndicators: Object.freeze([]),
    });
  } catch {
    return failedPassiveExtraction(
      "pdfjs-machine-text",
      "application/pdf",
      "unreadable",
      "PDF.js could not parse this document locally; no repair or OCR was attempted.",
    );
  } finally {
    await document?.destroy();
  }
}

export function splitPdfMachineTextPages(
  machineText: string,
): readonly { readonly pageNumber: number; readonly text: string }[] {
  return [
    ...machineText.matchAll(
      /^\[Page (\d+)\]\n([\s\S]*?)(?=\n\n\[Page \d+\]\n|$)/gmu,
    ),
  ].flatMap((match) => {
    const pageNumber = Number(match[1]);
    return Number.isSafeInteger(pageNumber) && pageNumber > 0
      ? [{ pageNumber, text: (match[2] ?? "").trim() }]
      : [];
  });
}
import {
  failedPassiveExtraction,
  type PassiveExtraction,
} from "./passive-result";

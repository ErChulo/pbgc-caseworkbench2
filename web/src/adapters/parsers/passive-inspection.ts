import { parseDelimited } from "./delimited-parser";
import { parseJson } from "./json-parser";
import { parseOoxmlPassive } from "./ooxml-parser";
import type { PassiveExtraction } from "./passive-result";
import { failedPassiveExtraction } from "./passive-result";
import { parsePdfPassive } from "./pdf-parser";
import { parsePlainText } from "./text-parser";
import { parseWorkbookPassive } from "./workbook-parser";
import { parseRasterImagePassive } from "./raster-image-parser";

export function inspectPassive(
  filename: string,
  bytes: Uint8Array,
): PassiveExtraction {
  const extension = filename.split(".").at(-1)?.toLowerCase() ?? "";
  switch (extension) {
    case "txt":
      return parsePlainText(bytes);
    case "json":
      return parseJson(bytes);
    case "csv":
      return parseDelimited(bytes, ",");
    case "tsv":
      return parseDelimited(bytes, "\t");
    case "xlsx":
    case "xlsm":
    case "xls":
      return parseWorkbookPassive(bytes);
    case "docx":
      return parseOoxmlPassive(bytes, "docx");
    case "pptx":
      return parseOoxmlPassive(bytes, "pptx");
    case "pdf":
      return parsePdfPassive(bytes);
    case "png":
      return parseRasterImagePassive(bytes, "png");
    case "jpg":
    case "jpeg":
      return parseRasterImagePassive(bytes, "jpeg");
    case "gif":
      return parseRasterImagePassive(bytes, "gif");
    default:
      return failedPassiveExtraction(
        "passive-dispatch",
        "application/octet-stream",
        "unsupported",
        "The initial passive parser set does not support this format.",
      );
  }
}

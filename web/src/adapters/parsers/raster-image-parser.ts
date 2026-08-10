import {
  failedPassiveExtraction,
  type PassiveExtraction,
} from "./passive-result";

export function parseRasterImagePassive(
  bytes: Uint8Array,
  kind: "png" | "jpeg" | "gif",
): PassiveExtraction {
  if (!hasExpectedSignature(bytes, kind)) {
    return failedPassiveExtraction(
      "raster-image-passive",
      mediaType(kind),
      "unreadable",
      "The filename extension and raster image signature do not match.",
    );
  }
  return Object.freeze({
    parserId: "raster-image-passive",
    parserVersion: "1.0.0",
    status: "success",
    mediaType: mediaType(kind),
    text: "",
    metadata: Object.freeze({ kind, sizeBytes: bytes.byteLength }),
    rawValues: Object.freeze([]),
    limitations: Object.freeze([
      "The original raster image is viewable locally. OCR was not performed because no approved OCR engine is installed.",
    ]),
    riskIndicators: Object.freeze([]),
  });
}

function hasExpectedSignature(
  bytes: Uint8Array,
  kind: "png" | "jpeg" | "gif",
): boolean {
  if (kind === "png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    return signature.every((byte, index) => bytes[index] === byte);
  }
  if (kind === "jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  const signature = new TextDecoder("ascii").decode(bytes.slice(0, 6));
  return signature === "GIF87a" || signature === "GIF89a";
}

function mediaType(kind: "png" | "jpeg" | "gif"): string {
  return kind === "jpeg" ? "image/jpeg" : `image/${kind}`;
}

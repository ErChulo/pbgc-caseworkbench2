export const prohibitedNetworkCapabilities = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "navigator.sendBeacon",
  "remote Worker",
  "navigator.serviceWorker.register",
] as const;

export const prohibitedExternalAssetUrls = [
  "https://example.invalid/script.js",
  "https://example.invalid/style.css",
  "https://example.invalid/font.woff2",
  "https://example.invalid/worker.js",
] as const;

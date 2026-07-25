export type SecurityBoundaryErrorCode =
  | "NETWORK_CAPABILITY_DISABLED"
  | "EXTERNAL_ASSET_URL_PROHIBITED"
  | "EXTERNAL_WORKER_URL_PROHIBITED"
  | "SECURITY_BOUNDARY_INSTALLATION_FAILED";

export class SecurityBoundaryError extends Error {
  readonly code: SecurityBoundaryErrorCode;
  readonly capability: string;

  constructor(
    code: SecurityBoundaryErrorCode,
    capability: string,
    safeMessage: string,
  ) {
    super(safeMessage);
    this.name = "SecurityBoundaryError";
    this.code = code;
    this.capability = capability;
  }
}

const installedScopes = new WeakSet<object>();
const localAssetSchemes = new Set(["blob:", "data:", "file:"]);
const localWorkerSchemes = new Set(["blob:", "file:"]);
const absoluteScheme = /^([a-z][a-z0-9+.-]*:)/iu;

export function installProductionSecurityBoundary(
  scope: Record<string, unknown>,
): void {
  if (installedScopes.has(scope)) {
    return;
  }

  const originalWorker = scope.Worker;
  replace(scope, "fetch", disabledCapability("fetch"));
  replace(scope, "XMLHttpRequest", disabledCapability("XMLHttpRequest"));
  replace(scope, "WebSocket", disabledCapability("WebSocket"));
  replace(scope, "EventSource", disabledCapability("EventSource"));
  replace(scope, "Worker", localOnlyWorkerConstructor(originalWorker));

  const navigatorRecord = requireRecord(scope.navigator, "navigator");
  replace(
    navigatorRecord,
    "sendBeacon",
    disabledCapability("navigator.sendBeacon"),
  );

  if (
    navigatorRecord.serviceWorker !== undefined &&
    navigatorRecord.serviceWorker !== null
  ) {
    const serviceWorkerRecord = requireRecord(
      navigatorRecord.serviceWorker,
      "navigator.serviceWorker",
    );
    replace(
      serviceWorkerRecord,
      "register",
      disabledCapability("service worker registration"),
    );
  }

  installedScopes.add(scope);
}

export function assertLocalAssetUrl(url: string): void {
  assertLocalUrl(
    url,
    localAssetSchemes,
    "asset",
    "EXTERNAL_ASSET_URL_PROHIBITED",
  );
}

export function assertLocalWorkerUrl(url: string): void {
  assertLocalUrl(
    url,
    localWorkerSchemes,
    "Worker",
    "EXTERNAL_WORKER_URL_PROHIBITED",
  );
}

function disabledCapability(capability: string): () => never {
  return function networkCapabilityDisabled(): never {
    throw new SecurityBoundaryError(
      "NETWORK_CAPABILITY_DISABLED",
      capability,
      `Production network capability ${capability} is disabled.`,
    );
  };
}

function localOnlyWorkerConstructor(
  originalWorker: unknown,
): (scriptUrl: unknown, ...options: unknown[]) => unknown {
  return function LocalOnlyWorker(
    scriptUrl: unknown,
    ...options: unknown[]
  ): unknown {
    if (
      typeof scriptUrl !== "string" &&
      !(typeof URL !== "undefined" && scriptUrl instanceof URL)
    ) {
      throw new SecurityBoundaryError(
        "EXTERNAL_WORKER_URL_PROHIBITED",
        "Worker",
        "Worker construction requires an explicit local URL.",
      );
    }
    assertLocalWorkerUrl(String(scriptUrl));

    if (typeof originalWorker !== "function") {
      throw new SecurityBoundaryError(
        "NETWORK_CAPABILITY_DISABLED",
        "Worker",
        "Worker construction is disabled in this runtime.",
      );
    }
    return Reflect.construct(originalWorker, [scriptUrl, ...options]);
  };
}

function assertLocalUrl(
  value: string,
  allowedSchemes: ReadonlySet<string>,
  capability: string,
  code: "EXTERNAL_ASSET_URL_PROHIBITED" | "EXTERNAL_WORKER_URL_PROHIBITED",
): void {
  if (
    value.length === 0 ||
    value !== value.trim() ||
    value.startsWith("//") ||
    value.startsWith("\\\\")
  ) {
    throw externalUrlError(code, capability);
  }

  const scheme = absoluteScheme.exec(value)?.[1]?.toLowerCase();
  if (scheme !== undefined && !allowedSchemes.has(scheme)) {
    throw externalUrlError(code, capability);
  }
}

function externalUrlError(
  code: "EXTERNAL_ASSET_URL_PROHIBITED" | "EXTERNAL_WORKER_URL_PROHIBITED",
  capability: string,
): SecurityBoundaryError {
  return new SecurityBoundaryError(
    code,
    capability,
    `External or network ${capability} URLs are prohibited; use an inlined local resource.`,
  );
}

function requireRecord(
  value: unknown,
  capability: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    throw new SecurityBoundaryError(
      "SECURITY_BOUNDARY_INSTALLATION_FAILED",
      capability,
      `The production security boundary could not disable ${capability}.`,
    );
  }
  return value as Record<string, unknown>;
}

function replace(
  target: Record<string, unknown>,
  property: string,
  value: unknown,
): void {
  try {
    Object.defineProperty(target, property, {
      configurable: true,
      enumerable: property in target,
      writable: false,
      value,
    });
  } catch {
    throw new SecurityBoundaryError(
      "SECURITY_BOUNDARY_INSTALLATION_FAILED",
      property,
      `The production security boundary could not disable ${property}.`,
    );
  }
}

export const PRODUCTION_MODE_LABEL = "Production local workspace" as const;
export const NON_PRODUCTION_MODE_LABEL =
  "Non-production session — durable preservation and resumability unavailable" as const;

export type FileSystemDeliveryMode =
  "direct-file" | "loopback-static-origin" | "unsupported";

export type FileSystemCapabilityBlockingReason =
  | "BROWSER_PROFILE_NOT_APPROVED"
  | "DELIVERY_MODE_NOT_APPROVED"
  | "SECURE_CONTEXT_REQUIRED"
  | "DIRECTORY_PICKER_UNAVAILABLE";

export interface FileSystemCapabilityPolicy {
  readonly approvedBrowserProfile: boolean;
  readonly directFileApproved: boolean;
  readonly loopbackStaticOriginApproved: boolean;
}

export interface FileSystemCapabilityEnvironment {
  readonly protocol: string;
  readonly hostname: string;
  readonly secureContext: boolean;
  readonly directoryPickerAvailable: boolean;
}

export interface FileSystemCapabilityRuntime {
  readonly location: {
    readonly protocol: string;
    readonly hostname: string;
  };
  readonly isSecureContext: boolean;
  readonly showDirectoryPicker?: unknown;
}

export interface ProductionFileSystemCapability {
  readonly mode: "production-local-workspace";
  readonly deliveryMode: Exclude<FileSystemDeliveryMode, "unsupported">;
  readonly label: typeof PRODUCTION_MODE_LABEL;
  readonly canSelectWorkspace: true;
  readonly canClaimDurablePreservation: true;
  readonly canClaimResumability: true;
  readonly allowsGovernedIntake: true;
  readonly allowsSessionReview: true;
  readonly blockingReasons: readonly [];
}

export interface NonProductionFileSystemCapability {
  readonly mode: "non-production-session";
  readonly deliveryMode: FileSystemDeliveryMode;
  readonly label: typeof NON_PRODUCTION_MODE_LABEL;
  readonly canSelectWorkspace: false;
  readonly canClaimDurablePreservation: false;
  readonly canClaimResumability: false;
  readonly allowsGovernedIntake: false;
  readonly allowsSessionReview: true;
  readonly blockingReasons: readonly FileSystemCapabilityBlockingReason[];
}

export type FileSystemCapability =
  ProductionFileSystemCapability | NonProductionFileSystemCapability;

export function detectFileSystemCapability(
  runtime: FileSystemCapabilityRuntime,
  policy: FileSystemCapabilityPolicy,
): FileSystemCapability {
  return evaluateFileSystemCapability(
    {
      protocol: runtime.location.protocol,
      hostname: runtime.location.hostname,
      secureContext: runtime.isSecureContext,
      directoryPickerAvailable:
        typeof runtime.showDirectoryPicker === "function",
    },
    policy,
  );
}

export function evaluateFileSystemCapability(
  environment: FileSystemCapabilityEnvironment,
  policy: FileSystemCapabilityPolicy,
): FileSystemCapability {
  const deliveryMode = classifyDeliveryMode(environment);
  const blockingReasons: FileSystemCapabilityBlockingReason[] = [];

  if (!policy.approvedBrowserProfile) {
    blockingReasons.push("BROWSER_PROFILE_NOT_APPROVED");
  }
  if (!deliveryModeIsApproved(deliveryMode, policy)) {
    blockingReasons.push("DELIVERY_MODE_NOT_APPROVED");
  }
  if (!environment.secureContext) {
    blockingReasons.push("SECURE_CONTEXT_REQUIRED");
  }
  if (!environment.directoryPickerAvailable) {
    blockingReasons.push("DIRECTORY_PICKER_UNAVAILABLE");
  }

  if (blockingReasons.length > 0 || deliveryMode === "unsupported") {
    return {
      mode: "non-production-session",
      deliveryMode,
      label: NON_PRODUCTION_MODE_LABEL,
      canSelectWorkspace: false,
      canClaimDurablePreservation: false,
      canClaimResumability: false,
      allowsGovernedIntake: false,
      allowsSessionReview: true,
      blockingReasons,
    };
  }

  return {
    mode: "production-local-workspace",
    deliveryMode,
    label: PRODUCTION_MODE_LABEL,
    canSelectWorkspace: true,
    canClaimDurablePreservation: true,
    canClaimResumability: true,
    allowsGovernedIntake: true,
    allowsSessionReview: true,
    blockingReasons: [],
  };
}

function classifyDeliveryMode(
  environment: FileSystemCapabilityEnvironment,
): FileSystemDeliveryMode {
  if (environment.protocol === "file:") {
    return "direct-file";
  }
  if (
    (environment.protocol === "http:" || environment.protocol === "https:") &&
    isLoopbackHostname(environment.hostname)
  ) {
    return "loopback-static-origin";
  }
  return "unsupported";
}

function deliveryModeIsApproved(
  mode: FileSystemDeliveryMode,
  policy: FileSystemCapabilityPolicy,
): boolean {
  switch (mode) {
    case "direct-file":
      return policy.directFileApproved;
    case "loopback-static-origin":
      return policy.loopbackStaticOriginApproved;
    case "unsupported":
      return false;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.normalize("NFC").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]" ||
    normalized === "::1"
  );
}

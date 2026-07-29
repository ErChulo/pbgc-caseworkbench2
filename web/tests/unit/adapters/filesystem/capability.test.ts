import { describe, expect, it } from "vitest";

import {
  detectFileSystemCapability,
  evaluateFileSystemCapability,
  NON_PRODUCTION_MODE_LABEL,
  PRODUCTION_MODE_LABEL,
  type FileSystemCapabilityEnvironment,
  type FileSystemCapabilityPolicy,
} from "../../../../src/adapters/filesystem/capability";

const approvedPolicy: FileSystemCapabilityPolicy = {
  approvedBrowserProfile: true,
  directFileApproved: true,
  loopbackStaticOriginApproved: true,
};

function environment(
  overrides: Partial<FileSystemCapabilityEnvironment> = {},
): FileSystemCapabilityEnvironment {
  return {
    protocol: "http:",
    hostname: "127.0.0.1",
    secureContext: true,
    directoryPickerAvailable: true,
    ...overrides,
  };
}

describe("T027 File System Access capability gate", () => {
  it("permits production intake from an approved loopback static origin", () => {
    const result = evaluateFileSystemCapability(environment(), approvedPolicy);

    expect(result).toEqual({
      mode: "production-local-workspace",
      deliveryMode: "loopback-static-origin",
      label: PRODUCTION_MODE_LABEL,
      canSelectWorkspace: true,
      canClaimDurablePreservation: true,
      canClaimResumability: true,
      allowsGovernedIntake: true,
      allowsSessionReview: true,
      blockingReasons: [],
    });
  });

  it("permits direct-file production only when that mode is explicitly approved", () => {
    const result = evaluateFileSystemCapability(
      environment({ protocol: "file:", hostname: "" }),
      approvedPolicy,
    );

    expect(result.mode).toBe("production-local-workspace");
    expect(result.deliveryMode).toBe("direct-file");

    const unapproved = evaluateFileSystemCapability(
      environment({ protocol: "file:", hostname: "" }),
      { ...approvedPolicy, directFileApproved: false },
    );
    expect(unapproved).toMatchObject({
      mode: "non-production-session",
      label: NON_PRODUCTION_MODE_LABEL,
      canClaimDurablePreservation: false,
      blockingReasons: ["DELIVERY_MODE_NOT_APPROVED"],
    });
  });

  it("fails closed without directory access or a secure context", () => {
    const missingApi = evaluateFileSystemCapability(
      environment({ directoryPickerAvailable: false }),
      approvedPolicy,
    );
    const insecure = evaluateFileSystemCapability(
      environment({ secureContext: false }),
      approvedPolicy,
    );

    expect(missingApi).toMatchObject({
      mode: "non-production-session",
      canSelectWorkspace: false,
      canClaimDurablePreservation: false,
      canClaimResumability: false,
      allowsGovernedIntake: false,
      blockingReasons: ["DIRECTORY_PICKER_UNAVAILABLE"],
    });
    expect(insecure).toMatchObject({
      mode: "non-production-session",
      blockingReasons: ["SECURE_CONTEXT_REQUIRED"],
    });
  });

  it("rejects unapproved browser profiles and non-loopback web origins", () => {
    const unapprovedBrowser = evaluateFileSystemCapability(environment(), {
      ...approvedPolicy,
      approvedBrowserProfile: false,
    });
    const remoteOrigin = evaluateFileSystemCapability(
      environment({ protocol: "https:", hostname: "example.invalid" }),
      approvedPolicy,
    );

    expect(unapprovedBrowser).toMatchObject({
      mode: "non-production-session",
      blockingReasons: ["BROWSER_PROFILE_NOT_APPROVED"],
    });
    expect(remoteOrigin).toMatchObject({
      mode: "non-production-session",
      blockingReasons: ["DELIVERY_MODE_NOT_APPROVED"],
    });
  });

  it("reports every independently blocking capability in stable order", () => {
    const result = evaluateFileSystemCapability(
      environment({
        protocol: "https:",
        hostname: "example.invalid",
        secureContext: false,
        directoryPickerAvailable: false,
      }),
      {
        approvedBrowserProfile: false,
        directFileApproved: false,
        loopbackStaticOriginApproved: false,
      },
    );

    expect(result.blockingReasons).toEqual([
      "BROWSER_PROFILE_NOT_APPROVED",
      "DELIVERY_MODE_NOT_APPROVED",
      "SECURE_CONTEXT_REQUIRED",
      "DIRECTORY_PICKER_UNAVAILABLE",
    ]);
    expect(result).toMatchObject({
      label: NON_PRODUCTION_MODE_LABEL,
      allowsSessionReview: true,
      allowsGovernedIntake: false,
    });
  });

  it("detects capability without invoking the directory picker", () => {
    let pickerCalls = 0;
    const runtime = {
      location: { protocol: "http:", hostname: "localhost" },
      isSecureContext: true,
      showDirectoryPicker: () => {
        pickerCalls += 1;
      },
    };

    const result = detectFileSystemCapability(runtime, approvedPolicy);

    expect(result.mode).toBe("production-local-workspace");
    expect(result.deliveryMode).toBe("loopback-static-origin");
    expect(pickerCalls).toBe(0);
  });

  it("keeps unsupported protocols in explicitly limited session mode", () => {
    const result = evaluateFileSystemCapability(
      environment({ protocol: "blob:", hostname: "" }),
      approvedPolicy,
    );

    expect(result).toMatchObject({
      mode: "non-production-session",
      deliveryMode: "unsupported",
      label: NON_PRODUCTION_MODE_LABEL,
      canSelectWorkspace: false,
      canClaimDurablePreservation: false,
      canClaimResumability: false,
      allowsGovernedIntake: false,
      allowsSessionReview: true,
    });
  });
});

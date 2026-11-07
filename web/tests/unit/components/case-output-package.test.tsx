import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CaseOutputPackagePanel } from "../../../src/components/case-output/CaseOutputPackagePanel";
import { buildFinalCaseworkOutputPayload } from "../../../src/domain/case-output/package-builder";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
} from "../../../src/domain/shared/types";

afterEach(cleanup);

it("shows a linked Section 436 evaluation as blocked rather than approved", () => {
  const caseId = parseUuid("00000000-0000-4000-8000-000000000001");
  const hash = parseSha256("a".repeat(64));
  const createdAt = parseUtcTimestamp("2026-11-06T00:00:00.000Z");
  if (!caseId.ok || !hash.ok || !createdAt.ok)
    throw new Error("Invalid test data");
  const reference = {
    artifactType: "section-436-evaluation" as const,
    artifactId: "synthetic",
    contentSha256: hash.value,
    mediaType: "application/json",
    description: "Synthetic",
  };
  const payload = buildFinalCaseworkOutputPayload({
    caseId: caseId.value,
    evidenceManifestSha256: null,
    planRules: [],
    populationProfileContentSha256: null,
    architecture: null,
    buildSpec: null,
    compiledFormulas: null,
    workbook: null,
    validation: null,
    reconciliation: null,
    section436: reference,
    section436Required: true,
    unresolvedItems: [],
    createdAt: createdAt.value,
    createdBy: null,
  });
  render(
    <CaseOutputPackagePanel
      payload={payload}
      linkedArtifacts={[reference]}
      busy={false}
      restoreBlocked={false}
      exportMessage={null}
      linkMessage={null}
      onLinkArtifact={vi.fn()}
      onExport={vi.fn()}
    />,
  );
  const stage = screen.getByText("Section 436 evaluation").closest("li");
  if (!stage) throw new Error("Stage missing");
  expect(within(stage).getByText(/Required · blocked/)).toBeVisible();
  expect(
    within(stage).getByText(
      /has not been verified as a completed, approved case evaluation/,
    ),
  ).toBeVisible();
  expect(
    screen.getByText(/A linked file does not make a stage ready/),
  ).toBeVisible();
});

it("disables link and export while case output is restoring or saving", () => {
  const id = parseUuid("00000000-0000-4000-8000-000000000001");
  const time = parseUtcTimestamp("2026-11-06T00:00:00.000Z");
  if (!id.ok || !time.ok) throw new Error("Invalid fixture");
  const payload = buildFinalCaseworkOutputPayload({
    caseId: id.value,
    evidenceManifestSha256: null,
    planRules: [],
    populationProfileContentSha256: null,
    architecture: null,
    buildSpec: null,
    compiledFormulas: null,
    workbook: null,
    validation: null,
    reconciliation: null,
    section436: null,
    section436Required: true,
    unresolvedItems: [],
    createdAt: time.value,
    createdBy: null,
  });
  render(
    <CaseOutputPackagePanel
      payload={payload}
      linkedArtifacts={[]}
      busy={true}
      restoreBlocked={false}
      exportMessage={null}
      linkMessage={null}
      onLinkArtifact={vi.fn()}
      onExport={vi.fn()}
    />,
  );
  expect(
    screen.getByText(/Case output is being checked or saved/),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Hash and link workspace artifact" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Export final output package" }),
  ).toBeDisabled();
});

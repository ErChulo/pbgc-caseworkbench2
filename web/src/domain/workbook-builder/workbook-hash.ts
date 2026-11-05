import { hashTyped } from "../manifests/canonical-json";
import type { Sha256 } from "../shared/types";
import type { V1Workbook } from "./models";

/** Hash the same content the workbook generator addresses, excluding its self-hash. */
export async function computeWorkbookContentHash(
  workbook: V1Workbook,
): Promise<Sha256> {
  const { workbookContentSha256: omitted, ...content } = workbook;
  void omitted;
  return (await hashTyped(
    { workbook: content },
    { typeName: "V1WorkbookContent" },
  )) as Sha256;
}

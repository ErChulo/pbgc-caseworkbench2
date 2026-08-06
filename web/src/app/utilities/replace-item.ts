import type { ArtifactInventoryItem } from "../../components/inventory/ArtifactInventory";

export function replaceItem(
  items: readonly ArtifactInventoryItem[],
  id: string,
  change: Partial<ArtifactInventoryItem>,
): ArtifactInventoryItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...change } : item));
}

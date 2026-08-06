import type { CasePurpose } from "../../domain/case/case";

export function purposeLabel(purpose: CasePurpose): string {
  switch (purpose) {
    case "test":
      return "Test";
    case "training":
      return "Training";
    case "duplicate-investigation":
      return "Duplicate investigation";
    case "production":
      return "Production";
  }
}

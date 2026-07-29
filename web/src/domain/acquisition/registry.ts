import type {
  DeterministicRequestPayload,
  ExtractionRegistration,
  MissingFactDeclaration,
  RerunTrigger,
  SourcePriorityRecommendation,
} from "./models";

export class AcquisitionRegistry {
  private readonly missingFacts = new Map<string, MissingFactDeclaration>();
  private readonly candidateTypes = new Set<string>();
  private readonly priorities = new Map<number, SourcePriorityRecommendation>();
  private readonly schemas = new Map<string, ExtractionRegistration>();
  private readonly instructions = new Map<string, ExtractionRegistration>();
  private rerun: RerunTrigger | null = null;

  constructor(private readonly requestingModuleId: string) {}

  registerMissingFact(value: MissingFactDeclaration): void {
    unique(this.missingFacts, value.factKey, value);
  }
  registerCandidateType(value: string): void {
    if (!value.trim()) throw new TypeError("Candidate type must be nonempty.");
    this.candidateTypes.add(value.normalize("NFC"));
  }
  registerPriority(value: SourcePriorityRecommendation): void {
    unique(this.priorities, value.priority, value);
  }
  registerSchema(value: ExtractionRegistration): void {
    unique(this.schemas, `${value.registrationId}@${value.version}`, value);
  }
  registerInstruction(value: ExtractionRegistration): void {
    unique(
      this.instructions,
      `${value.registrationId}@${value.version}`,
      value,
    );
  }
  registerRerunTrigger(value: RerunTrigger): void {
    if (value.requestingModuleId !== this.requestingModuleId)
      throw new TypeError("Rerun trigger module does not match registry.");
    this.rerun = value;
  }

  requestPayload(): DeterministicRequestPayload {
    const priorities = [...this.priorities.values()].sort(
      (left, right) => left.priority - right.priority,
    );
    return Object.freeze({
      requestingModuleId: this.requestingModuleId,
      missingFacts: Object.freeze([...this.missingFacts.values()]),
      candidateDocumentOrReportTypes: Object.freeze([...this.candidateTypes]),
      sourcePriorityRecommendations: Object.freeze(priorities),
      extractionSchemaRegistrations: Object.freeze([...this.schemas.values()]),
      extractionInstructionRegistrations: Object.freeze([
        ...this.instructions.values(),
      ]),
      rerunTrigger: this.rerun,
    });
  }
}

function unique<Key, Value>(
  map: Map<Key, Value>,
  key: Key,
  value: Value,
): void {
  if (map.has(key)) throw new TypeError("Duplicate registry identity.");
  map.set(key, value);
}

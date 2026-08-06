import { useMemo, useState, useCallback } from "react";
import { GovernedRegistry } from "../../domain/registry/governed-registry";
import { ProjectionService } from "../../domain/registry/projection-service";
import type {
  ArtifactRegistrationInput,
  ArtifactStatusUpdate,
  RegistryProjection,
} from "../../domain/registry/governed-registry";
import type {
  CaseReadModel,
  ArtifactReadModel,
} from "../../domain/registry/projection-service";

export interface GovernedRegistryHook {
  readonly projection: RegistryProjection;
  readonly caseReadModel: CaseReadModel | null;
  readonly artifacts: readonly ArtifactReadModel[];
  readonly registerArtifact: (input: ArtifactRegistrationInput) => void;
  readonly registerBatch: (
    inputs: readonly ArtifactRegistrationInput[],
  ) => void;
  readonly updateArtifactStatus: (update: ArtifactStatusUpdate) => void;
  readonly computeReconciliation: () => void;
  readonly reset: () => void;
}

export function useGovernedRegistry(
  caseId: string | null,
): GovernedRegistryHook {
  const registry = useMemo(() => new GovernedRegistry(), []);
  const projectionService = useMemo(() => new ProjectionService(), []);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  const registerArtifact = useCallback(
    (input: ArtifactRegistrationInput) => {
      registry.register(input);
      refresh();
    },
    [registry, refresh],
  );

  const registerBatch = useCallback(
    (inputs: readonly ArtifactRegistrationInput[]) => {
      registry.registerBatch(inputs);
      refresh();
    },
    [registry, refresh],
  );

  const updateArtifactStatus = useCallback(
    (update: ArtifactStatusUpdate) => {
      registry.updateArtifactStatus(update);
      refresh();
    },
    [registry, refresh],
  );

  const computeReconciliation = useCallback(() => {
    registry.computeReconciliation();
    refresh();
  }, [registry, refresh]);

  const reset = useCallback(() => {
    registry.reset();
    refresh();
  }, [registry, refresh]);

  const state = registry.getState();
  const projection = projectionService.project(state);
  const caseReadModel = caseId
    ? projectionService.projectForCase(caseId, state)
    : null;
  const artifacts = projectionService.projectArtifacts(state);

  // version is used to force re-renders
  void version;

  return {
    projection,
    caseReadModel,
    artifacts,
    registerArtifact,
    registerBatch,
    updateArtifactStatus,
    computeReconciliation,
    reset,
  };
}

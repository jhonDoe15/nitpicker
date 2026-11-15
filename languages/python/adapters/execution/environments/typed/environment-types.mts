import type { Launcher } from '../../../typed/environment/launcher-types.mts';
import type { Environment } from '../../../../../../shared/processes/environment.mts';
import type { SpawnFunction } from '../../typed/process-types.mts';

export type InstallKind = 'uv' | 'poetry' | 'pipenv' | 'pdm' | 'hatch' | 'conda' | 'python';

export type EnvironmentSpec = {
  readonly kind: string;
  readonly directory?: string;
  readonly detected?: true;
};

type VirtualEnvironment = (directory: string, description: string) => Launcher;

export type ManagerContext = {
  readonly projectRoot: string;
  readonly virtualenv: VirtualEnvironment;
  readonly spawn?: SpawnFunction | undefined;
};

export type InstallStep = {
  readonly kind: InstallKind;
  readonly command: readonly string[];
  readonly variables: Environment;
};

export type LockTool = {
  readonly kind: InstallKind;
  readonly lock: string;
  readonly binary: string;
  readonly args: readonly string[];
  readonly variables: (directory: string) => Environment;
  readonly forbids?: RegExp;
};

export type PipOptions = {
  readonly projectRoot: string;
  readonly requirementsFile: string;
  readonly constraints: readonly string[];
};

export type PlannedSteps = {
  readonly steps: readonly InstallStep[];
  readonly cleanup: () => void;
};

export type InstallPlan = {
  readonly label: string;
  readonly steps: (directory: string) => InstallStep[] | PlannedSteps;
};

export type BaseOptions = {
  readonly projectRoot: string;
  readonly liveRoot: string;
  readonly setting: string | undefined;
  readonly virtualenv: VirtualEnvironment;
};

export type RequirementLine = {
  readonly kind: 'include' | 'constraint' | 'keep' | 'drop';
  readonly value: string;
};

export type RequirementState = {
  readonly queue: string[];
  readonly lines: string[];
  readonly constraints: string[];
  readonly dropped: string[];
};

export type SafeRequirements = Omit<RequirementState, 'queue'>;

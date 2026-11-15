import type { Finding } from '../../../../adapters/static-checks/shared.mts';
import {
  PICK_SOURCE as untypedPickSource,
  createRunnerProjects as untypedCreateRunnerProjects,
  rulesOf as untypedRulesOf,
  runArea as untypedRunArea,
} from '../../../../adapters/test-runners/test-support/runner-project.mts';

export type ProjectFiles = Record<string, string | object>;

export const PICK_SOURCE: string = untypedPickSource;

export const createRunnerProjects: () => {
  project(files: ProjectFiles, options?: { linkDependencies?: false }): string;
  remove(): void;
} = untypedCreateRunnerProjects;

export const rulesOf: (findings: readonly Finding[]) => string[] = untypedRulesOf;

export const runArea: (kind: string, projectRoot: string) => Promise<readonly Finding[]> =
  untypedRunArea;

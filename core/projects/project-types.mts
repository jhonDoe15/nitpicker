import type { ConfiguredCli } from '../command/comparison/run-context.mts';
import type { CliOptions, ExitCode } from '../cli-context.mts';
import type { NitpickerConfig, ProjectOverlay } from '../../shared/values/config-types.mts';

export type ProjectEntry = {
  readonly path: string;
  readonly folder?: string;
  readonly preset?: string;
  readonly settings?: object;
  readonly origin?: unknown;
  readonly workspace?: string;
  readonly later?: true;
};

export type WorkspaceMember = {
  readonly path: string;
  readonly origin: string;
};

export type WorkspaceDeclaration = {
  readonly declared: boolean;
  readonly members: readonly WorkspaceMember[];
};

export type DetectedProjects = {
  readonly declared: boolean;
  readonly entries: readonly WorkspaceMember[];
  readonly multiple: boolean;
};

export type DependencyUnit = {
  readonly names: readonly string[];
  readonly needs: readonly string[];
  readonly folders: readonly string[];
  readonly labels?: ReadonlyMap<string, string>;
};

export type PlanContext = {
  readonly root: string;
  readonly repositoryRoot: string;
  readonly prefix: string;
  readonly rootConfig: NitpickerConfig;
  readonly allPaths: readonly string[];
};

export type Inspection = {
  readonly files: readonly string[];
  readonly undeclared?: readonly WorkspaceMember[];
  readonly plan?: MonorepoPlan;
};

export type PlanProject = {
  readonly path: string;
  readonly folder?: string;
  readonly absolute: string;
  readonly repoPath: string;
  readonly origin?: unknown;
  readonly overlay: ProjectOverlay | undefined;
  readonly preset: string;
  readonly sharedFiles: readonly string[];
  readonly toolchainRoot?: string;
  readonly derivedSourceRoots?: readonly string[];
  readonly configError?: string;
};

export type MonorepoPlan = {
  readonly root: string;
  readonly repositoryRoot: string;
  readonly prefix: string;
  readonly rootConfig: NitpickerConfig;
  readonly source: 'declared' | 'detected';
  readonly projects: readonly PlanProject[];
  readonly undeclared: readonly WorkspaceMember[];
  readonly submodules?: readonly string[];
};

export type ProjectSelection = {
  readonly path: string;
  readonly selected: boolean;
  readonly reason?: string;
};

export type ProjectOutcome = {
  readonly exitCode: number;
  readonly status: string;
  readonly complete: boolean;
  readonly newEnforceableFindings: number;
  readonly toolErrors: number;
  readonly error?: string;
};

export type ProjectRow = {
  readonly project: PlanProject;
  readonly selection: ProjectSelection;
  readonly outcome?: ProjectOutcome;
};

export type MonorepoCli = ConfiguredCli & { readonly singleProject?: true };

export type SelectionCli = {
  readonly options: Pick<CliOptions, 'all' | 'baseRef' | 'staged' | 'projectPaths'>;
  readonly environment: NodeJS.ProcessEnv;
  readonly workingDirectory?: string | undefined;
};

export type ProjectCli = {
  readonly currentProjectRoot: string;
  readonly currentFolder?: string | undefined;
  readonly configOverlay: ProjectOverlay | undefined;
  readonly singleProject: true;
  readonly sharedBase: ConfiguredCli['sharedBase'];
  readonly baseConfigOverlay: ProjectOverlay | undefined;
  readonly projectKey?: string | undefined;
  readonly sharedBaseWorktree?: ConfiguredCli['sharedBaseWorktree'];
  readonly sharedHeadWorktree?: ConfiguredCli['sharedHeadWorktree'];
};

export type RunProject = (options: CliOptions, extraCli: ProjectCli) => ExitCode;

export type Comparison = {
  readonly changed: readonly string[];
  readonly base?: ConfiguredCli['sharedBase'];
  readonly mergeBaseSha?: string;
  readonly basePlan?: MonorepoPlan | undefined;
};

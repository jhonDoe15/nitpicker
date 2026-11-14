import type { ConfiguredCli } from '../command/comparison/run-context.mts';
import type { CliOptions, ExitCode } from '../cli-context.mts';
import type { NitpickerConfig } from '../configuration/config-types.mts';
import type { ReportEntry } from '../../shared/values/findings.mts';

type ProjectOverlay = {
  readonly preset?: string;
  readonly companion?: boolean;
  readonly settings?: object;
  readonly declared?: boolean;
  readonly exclude?: readonly string[];
  readonly inherits?: string;
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
  readonly configError?: string;
};

export type MonorepoPlan = {
  readonly root: string;
  readonly repositoryRoot: string;
  readonly prefix: string;
  readonly rootConfig: NitpickerConfig;
  readonly source: 'declared' | 'detected';
  readonly projects: readonly PlanProject[];
  readonly undeclared: readonly unknown[];
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
  readonly policyDigest?: string;
  readonly error?: string;
};

export type ProjectRow = {
  readonly project: PlanProject;
  readonly selection: ProjectSelection;
  readonly outcome?: ProjectOutcome;
};

export type RepositoryPolicy = {
  readonly accepted: boolean;
  readonly policyLoosenings: readonly string[];
  readonly policyDigest?: string;
  readonly findings?: readonly ReportEntry[];
  readonly toolErrors?: readonly ReportEntry[];
};

export type MonorepoCli = ConfiguredCli & { readonly singleProject?: boolean };

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
  readonly repositoryLoosenings?: readonly unknown[];
  readonly repositoryToolErrors?: readonly ReportEntry[];
};

export type RunProject = (options: CliOptions, extraCli: ProjectCli) => ExitCode;

export type Comparison = {
  readonly changed: readonly string[];
  readonly base?: ConfiguredCli['sharedBase'];
  readonly mergeBaseSha?: string;
  readonly basePlan?: MonorepoPlan | undefined;
  readonly toolErrors?: readonly ReportEntry[];
};

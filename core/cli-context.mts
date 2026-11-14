import type { Analyzer, ProfiledAnalyzer } from '../shared/values/analyzers.mts';
import type { NitpickerConfig } from './configuration/config-types.mts';

export type TextOutput = {
  write(text: string): unknown;
};

export type CliOptions = {
  readonly analyzerNames: readonly string[];
  readonly ruleFilters: readonly string[];
  readonly fix: boolean;
  readonly details: boolean;
  readonly quick: boolean;
  readonly deferExit: boolean;
  readonly acceptPolicyChange?: string;
  readonly shardCount?: number | undefined;
  readonly shardIndex?: number | undefined;
  readonly paths?: readonly string[];
  readonly all: boolean;
  readonly help: boolean;
  readonly version: boolean;
  readonly json: boolean;
  readonly cache: boolean;
  readonly staged: boolean;
  readonly baseRef?: string;
  readonly outputRoot?: string;
};

type RunTasks = (...task: never[]) => unknown;

export type CliInput = {
  readonly arguments_?: readonly string[] | undefined;
  readonly environment?: NodeJS.ProcessEnv | undefined;
  readonly interactive?: unknown;
  readonly analyzers?: readonly Analyzer[] | undefined;
  readonly snapshotAnalyzers?: readonly Analyzer[] | undefined;
  readonly stdout?: TextOutput | undefined;
  readonly stderr?: TextOutput | undefined;
  readonly progress?: TextOutput | undefined;
  readonly runTasks?: RunTasks | undefined;
  readonly currentProjectRoot?: string | undefined;
  readonly workingDirectory?: string | undefined;
};

export type Cli = CliInput & {
  readonly arguments_: readonly string[];
  readonly environment: NodeJS.ProcessEnv;
  readonly interactive: boolean;
  readonly stdout: TextOutput;
  readonly stderr: TextOutput;
  readonly progress: TextOutput;
  readonly runTasks: RunTasks;
  readonly analyzers: readonly Analyzer[] | undefined;
  readonly snapshotAnalyzers: readonly Analyzer[] | undefined;
  readonly currentProjectRoot: string | undefined;
  readonly workingDirectory: string | undefined;
  readonly indexFile: string | undefined;
};

export type CheckCli = {
  readonly commandArguments: readonly string[];
  readonly stdout: TextOutput;
  readonly stderr: TextOutput;
  readonly environment: NodeJS.ProcessEnv;
};

export type ExitCode = number | Promise<number>;

export type Subcommand = (cli: Cli, rest: readonly string[]) => ExitCode;

export type ConfiguredRun = {
  readonly currentProjectRoot: string;
  readonly config: NitpickerConfig;
  readonly headPolicy: unknown;
  readonly scope: unknown;
  readonly setup: RunSetup;
};

export type RunSetup = {
  readonly analyzers: readonly ProfiledAnalyzer[];
  readonly quick: unknown;
  readonly captureHead: unknown;
  readonly setupErrors: readonly object[];
};

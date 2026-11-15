import type { SpawnSyncOptions } from 'node:child_process';
import type { CliInput, ExitCode } from '../../cli-context.mts';
import type { FixInvocation } from '../../fix/typed/fix-types.mts';

type FixCommandCall = FixInvocation & { readonly operation: string };

type CliRunInput = CliInput & {
  readonly executeFixCommand?: ((invocation: FixCommandCall) => unknown) | undefined;
};

type RunNitpickerCli = (input: CliRunInput) => ExitCode;

type FixtureRepository = {
  readonly root: string;
  readonly baseSha: string;
  readonly baseRef: string;
};

type FixtureInvocationContext = {
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: string;
  readonly snapshot?: string;
};

type FixtureInvocation = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
};

type FixtureAnalyzer = {
  readonly name: string;
  readonly version: string;
  configurationHash: string;
  readonly exclusions: readonly string[];
  readonly findingExitCodes: readonly number[];
  createInvocation: (context: FixtureInvocationContext) => FixtureInvocation;
};

type CliFixtures = {
  readonly runCli: (options: CliRunInput) => ExitCode;
  readonly createRepository: (initialFiles?: Readonly<Record<string, string>>) => FixtureRepository;
  readonly makeTemporaryRoot: (prefix: string) => string;
  readonly makeOutputRoot: () => string;
};

type PresetRun = {
  readonly exitCode: unknown;
  readonly reports: string;
  readonly json: (reportName: string) => unknown;
  readonly output: { readonly out: string; readonly err: string };
  readonly text: string;
};

type PresetRunOptions = {
  readonly subprocess?: true | undefined;
  readonly interactive?: true | undefined;
};

type PresetRunner = (
  root: string,
  extra?: readonly string[],
  options?: PresetRunOptions,
) => PresetRun;

type RepositoryFiles = Readonly<Record<string, string>>;

type BuildError = { readonly rule: string };

type RedBaseRepair = {
  readonly remove?: readonly string[];
  readonly write?: RepositoryFiles;
};

type MissingBinary<Message> = {
  readonly stub: (binary: string) => unknown;
  readonly rule: string;
  readonly message: Message;
};

type SharedFixtures = {
  readonly temporaryRoot: (prefix: string) => string;
  readonly run: PresetRunner;
  readonly runCli: (options: CliInput) => unknown;
  readonly repository: (files?: RepositoryFiles) => string;
};

type GradleFixtures = SharedFixtures & {
  readonly gradleRepository: (files?: RepositoryFiles) => string;
  readonly kotlinRepository: (files?: RepositoryFiles) => string;
  readonly build: {
    readonly failure: {
      readonly files: RepositoryFiles;
      readonly error: BuildError & {
        readonly message: (snapshot: string, reports: string) => string;
      };
    };
    readonly redBase: {
      readonly files: (suite: unknown) => RepositoryFiles;
      readonly repair: RedBaseRepair;
      readonly modules: {
        readonly files: (suite: unknown) => RepositoryFiles;
        readonly repair: RedBaseRepair;
      };
    };
    readonly missingBinary: MissingBinary<(binary: string, reports: string) => string>;
  };
};

type MavenFixtures = SharedFixtures & {
  readonly build: {
    readonly failure: {
      readonly files: RepositoryFiles;
      readonly error: BuildError & { readonly message: (snapshot: string) => string };
    };
    readonly redBase: {
      readonly files: (suite: string) => RepositoryFiles;
      readonly repair: RedBaseRepair;
    };
    readonly missingBinary: MissingBinary<(binary: string) => string>;
  };
};

type UnusedFieldFields = {
  readonly allowedForm: string;
  readonly exception: {
    readonly rule: string;
    readonly paths: readonly string[];
    readonly reason: string;
  };
  readonly exceptionList: string;
};

type PythonFixtures = {
  readonly temporaryRoot: (prefix: string) => string;
  readonly pythonRepository: (files?: Readonly<Record<string, string>>) => string;
  readonly run: PresetRunner;
  readonly callsLog: () => () => FakeCall[];
};

type FakeCall = {
  readonly tool: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly pythonPath: string;
  readonly seeded: unknown;
};

type PresetFixtureSettings = {
  readonly runCli: (input: CliInput) => unknown;
  readonly name: string;
  readonly templateFiles: Readonly<Record<string, string>>;
  readonly prepareRepository?: (root: string) => unknown;
  readonly runOptions?: CliInput;
};

type PresetFixtures = {
  readonly temporaryRoot: (prefix: string) => string;
  readonly repository: (files?: Readonly<Record<string, string>>) => string;
  readonly run: PresetRunner;
  readonly runCli: (options: CliInput) => unknown;
};

type SpawnOptions = SpawnSyncOptions & { readonly cwd: string };

type ToolAnswer = { readonly status: number; readonly stdout: string; readonly stderr: string };

type TypescriptCli = {
  readonly typescriptRepository: (files?: Readonly<Record<string, string>>) => string;
  readonly runTypescript: (
    root: string,
    analyzers: readonly string[],
  ) => {
    readonly exitCode: unknown;
    readonly json: (name: string) => unknown;
    readonly text: string;
  };
};

export type {
  TypescriptCli,
  SpawnOptions,
  ToolAnswer,
  PresetFixtureSettings,
  PresetFixtures,
  FixCommandCall,
  CliRunInput,
  RunNitpickerCli,
  FixtureRepository,
  FixtureInvocationContext,
  FixtureAnalyzer,
  CliFixtures,
  PresetRun,
  PresetRunOptions,
  RepositoryFiles,
  GradleFixtures,
  MavenFixtures,
  UnusedFieldFields,
  PythonFixtures,
  FakeCall,
};

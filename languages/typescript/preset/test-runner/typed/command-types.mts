import type { LayoutTestFiles } from '../../layout/layout-types.mts';

export type RunnerName = 'vitest' | 'jest' | 'node' | 'mocha';

export type CommandEnvironment = Readonly<Record<string, string>>;

export type CommandSegment = {
  readonly tokens: string[];
  readonly words: string[];
  readonly starts: number[];
};

export type OptionSets = {
  readonly flags?: readonly string[] | undefined;
  readonly valued?: readonly string[] | undefined;
  readonly variadic?: readonly string[] | undefined;
};

export type TestCommand = {
  readonly launcher?: string;
  readonly arguments_: readonly string[];
  readonly nodeArguments: readonly string[];
  readonly environment: CommandEnvironment;
  readonly precedingCommands?: readonly string[];
};

export type ParsedTestCommand = {
  readonly runner: string;
  readonly command: TestCommand;
};

export type FoundRunner = { readonly runner: string; readonly index: number };

export type CommandParts = {
  readonly nodeArguments: readonly string[];
  readonly arguments_: readonly string[];
  readonly launcher?: string;
  readonly environment?: CommandEnvironment;
};

export type PackageManifest = Readonly<Record<string, unknown>>;

export type Scripts = Readonly<Record<string, unknown>>;

export type RunnerEvidence = {
  readonly runner: string;
  readonly evidence: string;
  readonly command?: string | undefined;
};

type AmbiguousRunners = {
  readonly candidates: readonly RunnerEvidence[];
  readonly fallback: string;
  readonly runner?: undefined;
};

export type RunnerDetection =
  (RunnerEvidence & { readonly candidates?: undefined }) | AmbiguousRunners;

export type ScriptReference = { readonly name: string; readonly rest: readonly string[] };

export type DetectionLayout = {
  projectCodeFiles(projectRoot: string): readonly string[];
  isTestFile(file: string): boolean;
};

export type TestFileRequest = {
  readonly projectRoot: string;
  readonly liveProjectRoot: string;
  readonly command: TestCommand;
  readonly timeoutMs: number;
};

export type TestFileFacts = {
  readonly testFiles: LayoutTestFiles;
  readonly domEnvironment: boolean;
  readonly notices?: readonly string[];
};

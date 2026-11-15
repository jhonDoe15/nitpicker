import type { SpawnResult } from '../../execution/typed/process-types.mts';
import type { ToolContext, ToolSettings } from './tool-context-types.mts';

export type AnalyzerProbes = Map<string, SpawnResult>;

export type InvocationContext = {
  readonly projectRoot: string;
  readonly liveProjectRoot: string;
  readonly toolRoot: string;
  readonly baselineMovesFile: string | undefined;
  readonly mutationScope: unknown;
};

export type PythonInvocation = {
  readonly command: string;
  readonly args: string[];
  readonly cwd: string;
};

export type VersionReader = (context: ToolContext) => string;

export type PythonAnalyzer = {
  readonly name: string;
  readonly publishesModuleImports?: true;
  readonly version: string;
  readonly resolveVersion: (liveProjectRoot: string) => string;
  readonly configurationHash: string;
  readonly exclusions: string[];
  readonly reportedTools: string[];
  readonly dependencies?: string[];
  readonly toleratedDependencyErrors?: string[];
  readonly shardWeight?: number;
  readonly timeoutMs: number;
  readonly createInvocation: (context: InvocationContext) => PythonInvocation;
};

export type AnalyzerSettings = ToolSettings;

import type { SpawnFunction, SpawnResult } from '../../execution/typed/process-types.mts';
import type { Launcher } from '../environment/launcher-types.mts';

export type ToolSettings = {
  readonly formatter?: string | undefined;
  readonly typeChecker?: string | undefined;
  readonly testRunner?: string | undefined;
  readonly environment?: string | undefined;
  readonly sourceRoots?: readonly string[] | undefined;
  readonly testSeconds?: unknown;
  readonly importLinter?: unknown;
  readonly entryPoints?: unknown;
  readonly [field: string]: unknown;
};

export type ToolProject = {
  readonly formatter: string;
  readonly formatterDetected: boolean;
  readonly typeCheckers: readonly string[];
  readonly testRunner: string;
  readonly targetVersion: string;
  readonly importLinter: unknown;
  readonly sourceRoots: readonly string[];
  readonly entryPoints: unknown;
};

export type ToolContext = {
  readonly projectRoot: string;
  readonly reportRoot: string;
  readonly snapshot: string;
  readonly baselineRoot?: string | undefined;
  readonly testSeconds: unknown;
  readonly conventions: Readonly<Record<string, unknown>>;
  readonly layout: Readonly<Record<string, unknown>>;
  readonly policyRoot?: string | undefined;
  readonly toolPrecedence?: Readonly<Record<string, string[] | undefined>> | undefined;
  readonly probes: Map<string, SpawnResult>;
  readonly spawn?: SpawnFunction | undefined;
  readonly launcher: Launcher;
  readonly exclude: readonly string[];
  readonly duplicateSkippedFolders: unknown;
  readonly pytestAddopts: unknown;
  readonly mutationScope: unknown;
  readonly analyzerDeadlineMs?: number | undefined;
  readonly quick: boolean;
  readonly project: ToolProject;
  readonly env: Readonly<Record<string, string | undefined>>;
};

export type ToolContextOptions = {
  readonly projectRoot: string;
  readonly liveRoot: string;
  readonly settings?: ToolSettings;
  readonly reportRoot?: string | undefined;
  readonly exclude?: readonly string[];
  readonly duplicateSkippedFolders?: unknown;
  readonly snapshot?: string;
  readonly baselineRoot?: string | undefined;
  readonly conventions?: Readonly<Record<string, unknown>>;
  readonly layout?: Readonly<Record<string, unknown>>;
  readonly policyRoot?: string | undefined;
  readonly toolPrecedence?: Readonly<Record<string, string[] | undefined>> | undefined;
  readonly probes?: Map<string, SpawnResult>;
  readonly spawn?: SpawnFunction | undefined;
  readonly pytestAddopts?: unknown;
  readonly mutationScope?: unknown;
  readonly analyzerDeadlineMs?: number | undefined;
  readonly quick?: unknown;
};

export type ToolOutcome = {
  testsRan?: unknown;
  testFailures?: unknown;
};

export type ToolStep = (context: ToolContext, outcome: ToolOutcome) => void;

export type ProjectSettingsOptions = {
  readonly projectRoot: string;
  readonly liveRoot: string;
  readonly policyRoot: string | undefined;
  readonly settings: ToolSettings;
  readonly sourceRoots: readonly string[];
};

export type LauncherOptions = {
  readonly projectRoot: string;
  readonly liveRoot: string;
  readonly settings: ToolSettings;
  readonly spawn: SpawnFunction | undefined;
};

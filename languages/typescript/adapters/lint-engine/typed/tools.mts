import type { SpawnSyncReturns } from 'node:child_process';
import type { EslintOptions } from '../../eslint/arguments.mts';
import type { EslintToolSettings } from '../../typed/head-policy.mts';
import { lintWithOxlint as untypedLintWithOxlint } from '../../oxlint/oxlint-runner.mjs';
import { spawnCollected as untypedSpawnCollected } from '../../oxlint/oxlint-process.mjs';
import { projectLayerValue as untypedProjectLayerValue } from '../project-layer.mjs';
import { troubleshootingError as untypedTroubleshootingError } from '../../../../../shared/messages/troubleshooting.mjs';

export type LintEngineOptions = Pick<
  EslintOptions,
  | 'projectRoot'
  | 'liveProjectRoot'
  | 'configRelativePath'
  | 'environment'
  | 'patterns'
  | 'timeoutMs'
> & { readonly eslintCliPath?: string | undefined };

export type RunEslintCli = (
  patterns: readonly string[],
  extraEnvironment?: Readonly<Record<string, string>>,
) => Promise<unknown>;

export type CollectedRun = {
  readonly status: SpawnSyncReturns<string>['status'];
  readonly error: (Error & { readonly code?: unknown }) | undefined;
  readonly stdout: string;
  readonly stderr: string;
};

export const lintWithOxlint: (run: {
  readonly options: LintEngineOptions;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly projectConfigPath: string | undefined;
  readonly runEslintCli: RunEslintCli;
}) => Promise<unknown> = untypedLintWithOxlint;

export const spawnCollected: (
  command: string,
  argumentList: readonly string[],
  options: {
    readonly cwd: string;
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly maxBuffer: number;
    readonly timeoutMs: number;
  },
) => Promise<CollectedRun> = untypedSpawnCollected;

export const projectLayerValue: (
  settings: EslintToolSettings | undefined,
  context: { readonly liveProjectRoot: string; readonly addsRules: boolean },
) => string = untypedProjectLayerValue;

export const troubleshootingError: (
  message: string,
  anchor: string,
  options: ErrorOptions,
) => Error = untypedTroubleshootingError;

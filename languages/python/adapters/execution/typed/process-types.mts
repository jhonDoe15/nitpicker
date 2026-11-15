import type { SpawnSyncReturns } from 'node:child_process';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import type { Launcher } from '../../typed/environment/launcher-types.mts';

type SpawnError = { readonly code?: string; readonly message?: string };

export type SpawnResult = Pick<SpawnSyncReturns<string>, 'status' | 'stdout' | 'stderr'> & {
  readonly error?: SpawnError | undefined;
};

export type SpawnOptions = {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly encoding?: 'utf8';
  readonly maxBuffer?: number;
  readonly timeout?: number;
  readonly input?: string;
};

export type SpawnFunction = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => SpawnResult;

export type ProcessContext = {
  readonly launcher: Launcher;
  readonly projectRoot: string;
  readonly env?: Environment | undefined;
  readonly spawn?: unknown;
  readonly analyzerDeadlineMs?: number | undefined;
  readonly probes?: Map<string, SpawnResult> | undefined;
};

export type ExecuteOptions = {
  readonly timeout?: number | undefined;
  readonly env?: Environment | undefined;
  readonly defaultEnv?: Environment | undefined;
  readonly cwd?: string | undefined;
};

export type Accepted = readonly SpawnResult['status'][] | ((result: SpawnResult) => boolean);

export type RunOptions = ExecuteOptions & {
  readonly accepted?: Accepted | undefined;
  readonly rule?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly notFoundHint?: string | undefined;
};

export type FailureDetails = {
  readonly context: ProcessContext;
  readonly command: readonly string[];
  readonly result: SpawnResult;
  readonly rule?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly notFoundHint?: string | undefined;
};

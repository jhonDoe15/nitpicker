import type { Environment } from '../../../../shared/processes/environment.mts';
import type { AnalyzerTask } from '../tasks.mts';
import type { ProgressStream } from '../progress.mts';

export type ScriptOutput = {
  readonly status: unknown;
  readonly signal: unknown;
  readonly stdoutText: string;
  readonly stderrText: string;
};
export type RunContext = { readonly spawn: unknown; readonly environment: Environment };
export type Script = (argv: readonly string[], run: RunContext) => ScriptOutput | undefined;
type RunnerOptions = { readonly spawn?: unknown };
export type Runner = (argv: readonly string[], options: RunnerOptions) => unknown;
export type HygieneCli = {
  readonly commandArguments: readonly string[];
  readonly stdout: { readonly write: (text: string) => unknown };
  readonly stderr: { readonly write: (text: string) => unknown };
  readonly environment: Environment;
};
export type InProcessOptions = {
  readonly progress?: { readonly stream: ProgressStream; readonly label: string };
  readonly spawn?: unknown;
};
export type TaskMap = ReadonlyMap<string, AnalyzerTask>;

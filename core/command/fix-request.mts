import { fixWorkingTree } from '../fix/run-fix.mjs';
import type { TextOutput } from '../cli-context.mts';

type FixCli = {
  readonly options: { readonly fix: boolean };
  readonly currentProjectRoot: string;
  readonly executeFixCommand?: unknown;
  readonly headPolicy: unknown;
  readonly config: unknown;
  readonly scope: unknown;
  readonly environment: NodeJS.ProcessEnv;
  readonly spawnEnvironment: NodeJS.ProcessEnv;
  readonly stdout: TextOutput;
};

type FixResult = {
  readonly fixedFiles: readonly string[];
  readonly toolErrors: readonly unknown[];
  readonly notes?: readonly string[];
};

const fixTree: (options: object) => FixResult = fixWorkingTree;

export function fixIfRequested(
  cli: FixCli,
  repositoryRoot: string,
  base: { readonly baseRef: unknown },
): FixResult {
  if (!cli.options.fix) {
    return { fixedFiles: [], toolErrors: [] };
  }
  const fixResult = fixTree({
    repositoryRoot,
    projectRoot: cli.currentProjectRoot,
    baseRef: base.baseRef,
    executeFixCommand: cli.executeFixCommand,
    headPolicy: cli.headPolicy,
    config: cli.config,
    scope: cli.scope,
    environment: cli.environment,
    spawnEnvironment: cli.spawnEnvironment,
  });
  cli.stdout.write(
    `Fixed files:\n${fixResult.fixedFiles.length === 0 ? '(none)\n' : `${fixResult.fixedFiles.join('\n')}\n`}`,
  );
  const notes = fixResult.notes ?? [];
  if (notes.length > 0) {
    cli.stdout.write(`Fix notes:\n${notes.map((note) => `  ${note}\n`).join('')}`);
  }
  return fixResult;
}

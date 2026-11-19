import { GIT_OUTPUT_LIMIT_BYTES, GIT_TIMEOUT_MS } from '../../../../shared/processes/deadlines.mjs';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

type GitFailure = {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly result: Pick<SpawnSyncReturns<string>, 'stderr' | 'stdout' | 'status'>;
};

export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | undefined;

  constructor({ args, cwd, result }: GitFailure) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    super(`git ${args.join(' ')} failed in ${cwd}: ${detail}`);
    this.name = 'GitCommandError';
    this.args = args;
    this.cwd = cwd;
    this.exitCode = result.status ?? undefined;
  }
}

export function runGit(
  repositoryRoot: string,
  args: readonly string[],
  { environment }: { readonly environment?: Readonly<Record<string, string>> | undefined } = {},
): string {
  const result = spawnSync('git', [...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
    timeout: GIT_TIMEOUT_MS,
    env: environment === undefined ? process.env : { ...process.env, ...environment },
  });

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new GitCommandError({ args, cwd: repositoryRoot, result });
  }
  return result.stdout;
}

export function listRemotes(repositoryRoot: string): string[] {
  return runGit(repositoryRoot, ['remote'])
    .split(/\r?\n/)
    .filter((remote) => remote.length > 0);
}

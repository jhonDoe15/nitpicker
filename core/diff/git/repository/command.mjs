import { spawnSync } from 'node:child_process';
import { GIT_TIMEOUT_MS } from '../../../../shared/processes/deadlines.mjs';

export class GitCommandError extends Error {
  constructor({ args, cwd, result }) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    super(`git ${args.join(' ')} failed in ${cwd}: ${detail}`);
    this.name = 'GitCommandError';
    this.args = args;
    this.cwd = cwd;
    this.exitCode = result.status;
  }
}

export function runGit(repositoryRoot, args, { environment } = {}) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
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

export function listRemotes(repositoryRoot) {
  return runGit(repositoryRoot, ['remote'])
    .split(/\r?\n/)
    .filter((remote) => remote.length > 0);
}

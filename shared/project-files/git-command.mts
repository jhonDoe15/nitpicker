import { spawnSync } from 'node:child_process';
import { fieldOf } from '../values/readers.mts';
import type { GitResult } from './project-files-types.mts';

const ENV_PROGRAM = 'env';
const GIT_PROGRAM = 'git';
const MISSING_PROGRAM = 'ENOENT';
const SCRUBBED_VARIABLES = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
];
const NEUTRAL_ENVIRONMENT = [...SCRUBBED_VARIABLES.flatMap((name) => ['-u', name]), 'LC_ALL=C'];
const NEUTRAL_CONFIGURATION = ['-c', 'core.excludesFile=', '-c', 'safe.directory=*'];
const NOT_A_REPOSITORY =
  /not a git repository|gitfile does not point to a valid repository|invalid gitfile format/iu;
const SUCCESS = 0;
const GIT_TIMEOUT_MS = 10 * 60 * 1000;
const TRANSIENT_SPAWN_CODES = new Set(['ENOMEM', 'EAGAIN']);
const RETRY_DELAYS_MS = [50, 150];
const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));

function pauseSync(delayMs: number): void {
  Atomics.wait(SLEEP_BUFFER, 0, 0, delayMs);
}

function isTransientSpawnError(error: Error | undefined): boolean {
  const code = fieldOf(error, 'code');
  return typeof code === 'string' && TRANSIENT_SPAWN_CODES.has(code);
}

function spawnGitOnce(directory: string, args: readonly string[]) {
  const options = {
    cwd: directory,
    encoding: 'utf8' as const,
    maxBuffer: Number.POSITIVE_INFINITY,
    timeout: GIT_TIMEOUT_MS,
  };
  const gitArgs = [...NEUTRAL_CONFIGURATION, ...args];
  const scrubbed = spawnSync(
    ENV_PROGRAM,
    [...NEUTRAL_ENVIRONMENT, GIT_PROGRAM, ...gitArgs],
    options,
  );
  if (fieldOf(scrubbed.error, 'code') !== MISSING_PROGRAM) {
    return scrubbed;
  }
  return spawnSync(GIT_PROGRAM, gitArgs, options);
}

function spawnGit(directory: string, args: readonly string[]) {
  let result = spawnGitOnce(directory, args);
  for (const delayMs of RETRY_DELAYS_MS) {
    if (!isTransientSpawnError(result.error)) {
      return result;
    }
    pauseSync(delayMs);
    result = spawnGitOnce(directory, args);
  }
  return result;
}

export function neutralGit(
  directory: string,
  args: readonly string[],
  options: { readonly accepted?: readonly number[] } = {},
): GitResult | undefined {
  const { accepted = [SUCCESS] } = options;
  const result = spawnGit(directory, args);
  if (result.error !== undefined) {
    throw new Error(`Cannot run git in ${directory}: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.status !== null && accepted.includes(result.status)) {
    return { status: result.status, stdout: result.stdout };
  }
  if (NOT_A_REPOSITORY.test(result.stderr)) {
    return undefined;
  }
  const outcome = result.status ?? result.signal;
  throw new Error(
    `git ${String(args[0])} failed in ${directory} (${String(outcome)}): ${result.stderr.trim()}`,
  );
}

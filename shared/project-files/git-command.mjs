import { spawnSync } from 'node:child_process';

const ENV_PROGRAM = '/usr/bin/env';
const SCRUBBED_VARIABLES = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
];
const NEUTRAL_ENVIRONMENT = [...SCRUBBED_VARIABLES.flatMap((name) => ['-u', name]), 'LC_ALL=C'];
const NEUTRAL_CONFIGURATION = ['-c', 'core.excludesFile=', '-c', 'safe.directory=*'];
const NOT_A_REPOSITORY = /not a git repository/iu;
const SUCCESS = 0;

export function neutralGit(directory, args, { accepted = [SUCCESS] } = {}) {
  const result = spawnSync(
    ENV_PROGRAM,
    [...NEUTRAL_ENVIRONMENT, 'git', ...NEUTRAL_CONFIGURATION, ...args],
    { cwd: directory, encoding: 'utf8', maxBuffer: Number.POSITIVE_INFINITY },
  );
  if (result.error !== undefined) {
    throw new Error(`Cannot run git in ${directory}: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (accepted.includes(result.status)) {
    return { status: result.status, stdout: result.stdout };
  }
  if (NOT_A_REPOSITORY.test(result.stderr)) {
    return undefined;
  }
  const outcome = result.status ?? result.signal;
  throw new Error(
    `git ${args[0]} failed in ${directory} (${String(outcome)}): ${result.stderr.trim()}`,
  );
}

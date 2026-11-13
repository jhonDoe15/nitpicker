import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

const GIT_TIMEOUT_MS = 60 * 1000;

export function repositoryRootOf(projectRoot: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
  });
  return result.status === 0 ? realpathSync(result.stdout.trim()) : undefined;
}

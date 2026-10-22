import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

export function repositoryRootOf(projectRoot) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return result.status === 0 ? realpathSync(result.stdout.trim()) : undefined;
}

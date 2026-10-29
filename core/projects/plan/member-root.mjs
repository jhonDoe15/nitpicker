import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';

function isInsideFolder(folder, candidate) {
  return candidate === folder || candidate.startsWith(folder + path.sep);
}

export function isGitWorkTree(directory) {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: directory,
    stdio: 'ignore',
  });
  return result.status === 0;
}

export function memberProjectOf(plan, workingDirectory) {
  const current = realpathSync(workingDirectory ?? process.cwd());
  if (current === plan.root || !isInsideFolder(plan.root, current)) {
    return undefined;
  }
  return plan.projects
    .filter((project) => project.path !== '.' && isInsideFolder(project.absolute, current))
    .toSorted((left, right) => right.path.length - left.path.length)[0];
}

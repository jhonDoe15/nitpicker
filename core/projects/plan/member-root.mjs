import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { GIT_TIMEOUT_MS } from '../../../shared/processes/deadlines.mjs';

function isInsideFolder(folder, candidate) {
  return candidate === folder || candidate.startsWith(folder + path.sep);
}

export function isGitWorkTree(directory) {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: directory,
    stdio: 'ignore',
    timeout: GIT_TIMEOUT_MS,
  });
  return result.status === 0;
}

export function memberProjectOf(plan, workingDirectory) {
  const current = realpathSync(workingDirectory ?? process.cwd());
  if (current === plan.root || !isInsideFolder(plan.root, current)) {
    return undefined;
  }
  const around = plan.projects.filter(
    (project) =>
      (project.folder ?? project.path) !== '.' && isInsideFolder(project.absolute, current),
  );
  const deepest = around.reduce(
    (found, project) =>
      found === undefined || project.absolute.length > found.absolute.length ? project : found,
    undefined,
  );
  const sharing = around.filter((project) => project.absolute === deepest?.absolute);
  return sharing.length === 1 ? deepest : undefined;
}

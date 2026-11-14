import { lstatSync } from 'node:fs';
import { runGit } from '../../diff/git/repository/command.mjs';
import { normalizeGitPath } from '../../diff/git/normalize.mjs';
import { isInScope } from '../../scope/scope-findings.mjs';
import { containedPath } from '../common/contained-path.mjs';

function projectPaths(projectRoot) {
  const output = runGit(projectRoot, [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    '.',
  ]);
  return [
    ...new Set(
      output
        .split('\0')
        .filter((name) => name.length > 0)
        .map((name) => normalizeGitPath(name)),
    ),
  ].toSorted((left, right) => left.localeCompare(right));
}

function kindOf(projectRoot, name) {
  const stats = lstatSync(containedPath(projectRoot, name), { throwIfNoEntry: false });
  return { isFile: stats?.isFile() === true, isLink: stats?.isSymbolicLink() === true };
}

export function collectProjectFiles({ projectRoot, accepts, scope }) {
  const entries = projectPaths(projectRoot)
    .filter((name) => accepts(name) && isInScope(name, scope))
    .map((name) => ({ path: name, basePath: name, ...kindOf(projectRoot, name) }));
  return {
    comparison: { mergeBaseSha: undefined },
    files: entries.filter(({ isFile }) => isFile),
    links: entries.filter(({ isLink }) => isLink).map(({ path: name }) => name),
  };
}

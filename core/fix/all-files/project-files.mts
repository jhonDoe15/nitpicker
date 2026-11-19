import { lstatSync } from 'node:fs';
import { runGit } from '../../diff/git/repository/command.mts';
import { normalizeGitPath } from '../../diff/git/normalize.mts';
import { isInScope } from '../../scope/scope-findings.mts';
import { containedPath } from '../tool-steps/paths/contained-path.mts';
import type { CollectedFiles } from '../typed/command-types.mts';
import type { Scope } from '../../scope/scope-findings.mts';

function projectPaths(projectRoot: string): string[] {
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

function kindOf(projectRoot: string, name: string): { isFile: boolean; isLink: boolean } {
  const stats = lstatSync(containedPath(projectRoot, name), { throwIfNoEntry: false });
  return { isFile: stats?.isFile() === true, isLink: stats?.isSymbolicLink() === true };
}

export function collectProjectFiles({
  projectRoot,
  accepts,
  scope,
}: {
  readonly projectRoot: string;
  readonly accepts: (name: string) => boolean;
  readonly scope: Scope | undefined;
}): CollectedFiles {
  const entries = projectPaths(projectRoot)
    .filter((name) => accepts(name) && isInScope(name, scope))
    .map((name) => ({ path: name, basePath: name, ...kindOf(projectRoot, name) }));
  return {
    comparison: { mergeBaseSha: undefined },
    files: entries.filter(({ isFile }) => isFile),
    links: entries.filter(({ isLink }) => isLink).map(({ path: name }) => name),
  };
}

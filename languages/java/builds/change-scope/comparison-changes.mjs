import {
  DIFF_ALGORITHM,
  parseChangedLines,
} from '../../../../core/diff/git/patches/changed-lines.mjs';
import { GitCommandError, runGit } from '../../../../core/diff/git/repository/command.mjs';
import { diffFromBase } from '../../../../core/tooling/git/base-diff.mjs';
import { isJvmProductionPath, isJvmTestPath } from './jvm-paths.mjs';

const UNCHANGED_CONTENT = /^[CR]100$/u;
const DIFF_OPTIONS = ['--find-renames', '--relative', '--no-color', '--no-ext-diff'];

function diffBetween(roots, format) {
  return diffFromBase({
    runGit,
    baselineRoot: roots.base,
    projectRoot: roots.head,
    args: [...format, ...DIFF_OPTIONS],
  });
}

function nameStatusEntries(output) {
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [status, from, to = from] = line.split('\t');
      return { status, from, to };
    });
}

function renamedSources(entries) {
  return entries
    .filter(({ status, to }) => status.startsWith('R') && isJvmProductionPath(to))
    .map(({ from, to }) => [from, to]);
}

function changedTests(listed) {
  const entries = listed.filter(({ status }) => !UNCHANGED_CONTENT.test(status));
  return {
    head: entries
      .filter(({ status, to }) => status !== 'D' && isJvmTestPath(to))
      .map(({ to }) => to),
    base: entries
      .filter(({ status, from }) => !['A', 'C'].includes(status[0]) && isJvmTestPath(from))
      .map(({ from }) => from),
  };
}

function changedSources(roots) {
  const files = parseChangedLines(diffBetween(roots, ['--unified=0', DIFF_ALGORITHM])).values();
  return new Map(
    [...files]
      .filter((file) => isJvmProductionPath(file.path) && file.ranges.length > 0)
      .map((file) => [file.path, file.ranges]),
  );
}

export function readComparisonChanges(roots) {
  let listing;
  try {
    listing = diffBetween(roots, ['--name-status']);
  } catch (error) {
    if (error instanceof GitCommandError) {
      return undefined;
    }
    throw error;
  }
  const entries = nameStatusEntries(listing);
  return {
    sources: changedSources(roots),
    tests: changedTests(entries),
    renames: renamedSources(entries),
  };
}

import { realpathSync } from 'node:fs';
import {
  DIFF_ALGORITHM,
  parseChangedLines,
} from '../../../../core/diff/git/patches/changed-lines.mjs';
import { GitCommandError, runGit } from '../../../../core/diff/git/repository/command.mjs';
import { diffFromBase } from '../../../../core/tooling/git/base-diff.mjs';
import { type NameStatus, nameStatusEntries } from '../../../../core/tooling/git/name-status.mts';
import { isJvmProductionPath, isJvmTestPath } from './jvm-paths.mts';
import { fieldOf, listOf, numberOr, textOf } from '../../../../shared/values/readers.mts';

export type ComparisonRoots = { readonly base: string; readonly head: string };
export type LineRange = readonly [number, number];
export type ChangedTests = { readonly head: string[]; readonly base: string[] };
export type ComparisonChanges = {
  readonly sources: Map<string, LineRange[]>;
  readonly tests: ChangedTests;
  readonly renames: [string, string][];
};

const UNCHANGED_CONTENT = /^[CR]100$/u;
const DIFF_OPTIONS = ['--find-renames', '--no-color', '--no-ext-diff'];

type RootsPolicy = {
  readonly snapshot?: unknown;
  readonly policyRoot?: string | undefined;
  readonly baselineRoot?: string | undefined;
};
export type DiffPaths = 'project' | 'repository';

function sameDirectory(left: string, right: string): boolean {
  return realpathSync.native(left) === realpathSync.native(right);
}

export function comparisonRoots(
  projectRoot: string,
  policy: RootsPolicy,
): ComparisonRoots | undefined {
  if (policy.snapshot === 'base') {
    const head = policy.policyRoot;
    return head === undefined || sameDirectory(head, projectRoot)
      ? undefined
      : { base: projectRoot, head };
  }
  return policy.baselineRoot === undefined
    ? undefined
    : { base: policy.baselineRoot, head: projectRoot };
}

function diffBetween(
  roots: ComparisonRoots,
  format: readonly string[],
  paths: DiffPaths = 'project',
): string {
  return textOf(
    diffFromBase({
      runGit,
      baselineRoot: roots.base,
      projectRoot: roots.head,
      args: [...format, ...DIFF_OPTIONS, ...(paths === 'project' ? ['--relative'] : [])],
    }),
  );
}

function renamedSources(entries: readonly NameStatus[]): [string, string][] {
  return entries
    .filter(({ status, to }) => status.startsWith('R') && isJvmProductionPath(to))
    .map(({ from, to }) => [from, to]);
}

function changedTests(listed: readonly NameStatus[]): ChangedTests {
  const entries = listed.filter(({ status }) => !UNCHANGED_CONTENT.test(status));
  return {
    head: entries
      .filter(({ status, to }) => status !== 'D' && isJvmTestPath(to))
      .map(({ to }) => to),
    base: entries
      .filter(({ status, from }) => !['A', 'C'].includes(status.charAt(0)) && isJvmTestPath(from))
      .map(({ from }) => from),
  };
}

function rangeOf(value: unknown): LineRange {
  const [start, end] = listOf(value);
  return [numberOr(start, 0), numberOr(end, 0)];
}

function changedSources(roots: ComparisonRoots): Map<string, LineRange[]> {
  const parsed: unknown = parseChangedLines(diffBetween(roots, ['--unified=0', DIFF_ALGORITHM]));
  const files = parsed instanceof Map ? [...parsed.values()] : [];
  return new Map(
    files
      .map((file): [string, LineRange[]] => [
        textOf(fieldOf(file, 'path')),
        listOf(fieldOf(file, 'ranges')).map(rangeOf),
      ])
      .filter(([file, ranges]) => isJvmProductionPath(file) && ranges.length > 0),
  );
}

function nameStatusListing(roots: ComparisonRoots): string | undefined {
  try {
    return diffBetween(roots, ['--name-status']);
  } catch (error) {
    if (error instanceof GitCommandError) {
      return undefined;
    }
    throw error;
  }
}

export function readComparisonChanges(roots: ComparisonRoots): ComparisonChanges | undefined {
  const listing = nameStatusListing(roots);
  if (listing === undefined) {
    return undefined;
  }
  const entries = nameStatusEntries(listing);
  return {
    sources: changedSources(roots),
    tests: changedTests(entries),
    renames: renamedSources(entries),
  };
}

export function readChangedFiles(roots: ComparisonRoots, paths?: DiffPaths): string[] | undefined {
  try {
    return nameStatusEntries(diffBetween(roots, ['--name-status'], paths)).flatMap(
      ({ from, to }) => [...new Set([from, to])],
    );
  } catch (error) {
    if (error instanceof GitCommandError) {
      return undefined;
    }
    throw error;
  }
}

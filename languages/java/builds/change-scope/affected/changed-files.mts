import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { byCodeUnits } from '../../../../../core/scope/mutation-scope.mjs';
import { GitCommandError, runGit } from '../../../../../core/diff/git/repository/command.mjs';
import { type ComparisonRoots, comparisonRoots, readChangedFiles } from '../comparison-changes.mts';
import { ancestorDirectories as untypedAncestorDirectories } from '../../../../../shared/filesystem.mjs';
import type { JavaFinding, JavaPolicy } from '../../../adapters/typed/java-values.mts';
import { listOf, textsOf } from '../../../../../shared/values/readers.mts';

type ChangedFilesRun = { readonly policy?: JavaPolicy | undefined };

const ancestorDirectories: (directory: string) => string[] = untypedAncestorDirectories;

const BUILD_FILE = /^(?:pom\.xml|(?:build|settings)\.gradle(?:\.kts)?)$/u;
const BUILD_FILES = ['pom.xml', 'build.gradle', 'build.gradle.kts'];

function hasBuildFile(directory: string): boolean {
  for (const name of BUILD_FILES) {
    if (existsSync(path.join(directory, name))) {
      return true;
    }
  }
  return false;
}

function nearestExisting(directory: string): string {
  return ancestorDirectories(directory).find((candidate) => existsSync(candidate)) ?? directory;
}

function ancestorsBelow(root: string, start: string): string[] {
  const chain = ancestorDirectories(start);
  const end = chain.findIndex((current) => current === root || !current.startsWith(root));
  return end === -1 ? chain : chain.slice(0, end);
}

function insideModule(root: string, directory: string): boolean {
  return ancestorsBelow(root, nearestExisting(directory)).some(hasBuildFile);
}

function existsWithin(root: string, relativePath: string): boolean {
  const full = path.resolve(root, relativePath);
  if (path.relative(root, full).startsWith('..')) {
    return false;
  }
  return existsSync(full);
}

function ownedOnBothSides(file: string, roots: ComparisonRoots): boolean {
  const sides = [roots.base, roots.head];
  if (BUILD_FILE.test(path.basename(file))) {
    return sides.every((root) => existsWithin(root, file));
  }
  const directory = path.dirname(file);
  return sides.every(
    (root) => existsWithin(root, directory) || insideModule(root, path.join(root, directory)),
  );
}

function hidesOutsideChanges(roots: ComparisonRoots, files: readonly string[]): boolean {
  if (existsSync(path.join(roots.head, '.git')) || !isMultiModule(path.dirname(roots.head))) {
    return false;
  }
  const all = readChangedFiles(roots, 'repository');
  return all === undefined || new Set(all).size > new Set(files).size;
}

export function changedFilesOf(projectRoot: string, policy: JavaPolicy = {}): string[] | undefined {
  const roots = comparisonRoots(projectRoot, policy);
  const files = roots === undefined ? undefined : readChangedFiles(roots);
  if (
    roots === undefined ||
    files === undefined ||
    !files.every((file) => ownedOnBothSides(file, roots)) ||
    hidesOutsideChanges(roots, files)
  ) {
    return undefined;
  }
  return [...new Set(files)].toSorted(byCodeUnits);
}

export function withChangedFiles<T extends ChangedFilesRun>(options: T, projectRoot: string): T {
  const changedFiles = changedFilesOf(projectRoot, options.policy);
  return changedFiles === undefined
    ? options
    : { ...options, policy: { ...options.policy, changedFiles } };
}

export function notAffectedFindings(
  notAffected: unknown,
  policy: JavaPolicy | undefined,
): JavaFinding[] {
  const listed = textsOf(listOf(notAffected));
  if (policy?.snapshot !== 'head' || !Array.isArray(notAffected) || listed.length === 0) {
    return [];
  }
  const names = listed.toSorted(byCodeUnits);
  return [
    {
      tool: policy.preset ?? 'java',
      rule: 'modules-not-affected',
      path: '.',
      identity: `modules-not-affected|${names.join(',')}`,
      message: `modules not affected: ${names.join(', ')}`,
      classification: 'descriptive',
    },
  ];
}

const INCLUDE = /\binclude\b/u;
const MODULE_LISTING: Readonly<Record<string, RegExp>> = {
  'pom.xml': /<modules>/u,
  'settings.gradle': INCLUDE,
  'settings.gradle.kts': INCLUDE,
};

function listsModules(directory: string): boolean {
  for (const [name, pattern] of Object.entries(MODULE_LISTING)) {
    const file = path.join(directory, name);
    if (existsSync(file) && pattern.test(readFileSync(file, 'utf8'))) {
      return true;
    }
  }
  return false;
}

export function isMultiModule(projectRoot: string): boolean {
  for (const directory of ancestorDirectories(projectRoot)) {
    if (listsModules(directory)) {
      return true;
    }
    if (existsSync(path.join(directory, '.git'))) {
      return false;
    }
  }
  return false;
}

export function repositoryChangeKey(headRoot: string, mergeBaseSha: string | undefined): string {
  if (mergeBaseSha === undefined) {
    return 'unknown';
  }
  try {
    return runGit(headRoot, [
      'diff',
      '--name-status',
      '--find-renames',
      '--no-color',
      '--no-ext-diff',
      mergeBaseSha,
      'HEAD',
    ])
      .split('\n')
      .toSorted(byCodeUnits)
      .join('\n');
  } catch (error) {
    if (error instanceof GitCommandError) {
      return 'unknown';
    }
    throw error;
  }
}

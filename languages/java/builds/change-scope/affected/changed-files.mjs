import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { byCodeUnits } from '../../../../../core/scope/mutation-scope.mjs';
import { GitCommandError, runGit } from '../../../../../core/diff/git/repository/command.mjs';
import { comparisonRoots, readChangedFiles } from '../comparison-changes.mjs';
import { ancestorDirectories } from '../../../../../shared/filesystem.mjs';

const BUILD_FILE = /^(?:pom\.xml|(?:build|settings)\.gradle(?:\.kts)?)$/u;
const BUILD_FILES = ['pom.xml', 'build.gradle', 'build.gradle.kts'];

function hasBuildFile(directory) {
  for (const name of BUILD_FILES) {
    if (existsSync(path.join(directory, name))) {
      return true;
    }
  }
  return false;
}

function nearestExisting(directory) {
  return ancestorDirectories(directory).find((candidate) => existsSync(candidate)) ?? directory;
}

function ancestorsBelow(root, start) {
  const chain = ancestorDirectories(start);
  const end = chain.findIndex((current) => current === root || !current.startsWith(root));
  return end === -1 ? chain : chain.slice(0, end);
}

function insideModule(root, directory) {
  return ancestorsBelow(root, nearestExisting(directory)).some(hasBuildFile);
}

function existsWithin(root, relativePath) {
  const full = path.resolve(root, relativePath);
  if (path.relative(root, full).startsWith('..')) {
    return false;
  }
  return existsSync(full);
}

function ownedOnBothSides(file, roots) {
  const sides = [roots.base, roots.head];
  if (BUILD_FILE.test(path.basename(file))) {
    return sides.every((root) => existsWithin(root, file));
  }
  const directory = path.dirname(file);
  return sides.every(
    (root) => existsWithin(root, directory) || insideModule(root, path.join(root, directory)),
  );
}

function hidesOutsideChanges(roots, files) {
  if (existsSync(path.join(roots.head, '.git')) || !isMultiModule(path.dirname(roots.head))) {
    return false;
  }
  const all = readChangedFiles(roots, { relative: false });
  return all === undefined || new Set(all).size > new Set(files).size;
}

export function changedFilesOf(projectRoot, policy = {}) {
  const roots = comparisonRoots(projectRoot, policy);
  const files = roots === undefined ? undefined : readChangedFiles(roots);
  if (
    files === undefined ||
    !files.every((file) => ownedOnBothSides(file, roots)) ||
    hidesOutsideChanges(roots, files)
  ) {
    return undefined;
  }
  return [...new Set(files)].toSorted(byCodeUnits);
}

export function withChangedFiles(options, projectRoot) {
  const changedFiles = changedFilesOf(projectRoot, options.policy);
  return changedFiles === undefined
    ? options
    : { ...options, policy: { ...options.policy, changedFiles } };
}

export function notAffectedFindings(notAffected, policy) {
  if (policy?.snapshot !== 'head' || !Array.isArray(notAffected) || notAffected.length === 0) {
    return [];
  }
  const names = notAffected.toSorted(byCodeUnits);
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
const MODULE_LISTING = {
  'pom.xml': /<modules>/u,
  'settings.gradle': INCLUDE,
  'settings.gradle.kts': INCLUDE,
};

function listsModules(directory) {
  for (const [name, pattern] of Object.entries(MODULE_LISTING)) {
    const file = path.join(directory, name);
    if (existsSync(file) && pattern.test(readFileSync(file, 'utf8'))) {
      return true;
    }
  }
  return false;
}

export function isMultiModule(projectRoot) {
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

export function repositoryChangeKey(headRoot, mergeBaseSha) {
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

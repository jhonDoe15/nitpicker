import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sourceLines } from '../../../java/adapters/metrics/java-structure.mjs';
import {
  DOCUMENTATION_DIRECTORIES,
  importRoots,
  INSTALLED_DIRECTORIES,
  NON_SOURCE_DIRECTORIES,
  NON_SOURCE_FILES,
} from '../execution/python-project.mjs';
import { nonProductionTestGlobs, TEST_FILE_NAME } from '../execution/python-test-files.mjs';

const SOURCE_LISTING = 'python-files.txt';
const WHOLE_PROJECT = '.';
const INSTALLED = new Set(INSTALLED_DIRECTORIES);

function isPythonFile(entry, { wholeProject }) {
  return (
    entry.isFile() &&
    entry.name.endsWith('.py') &&
    !(wholeProject && NON_SOURCE_FILES.has(entry.name))
  );
}

function isSearched(entry, { wholeProject }) {
  const skipped = wholeProject ? NON_SOURCE_DIRECTORIES : INSTALLED;
  return entry.isDirectory() && !entry.name.startsWith('.') && !skipped.has(entry.name);
}

function isDirectory(absolute) {
  return existsSync(absolute) && statSync(absolute).isDirectory();
}

export function pythonSourceFiles(projectRoot, sourceRoots) {
  const found = new Set();
  const pending = sourceRoots.map((directory) => ({
    directory,
    wholeProject: directory === WHOLE_PROJECT,
  }));
  for (const { directory, wholeProject } of pending) {
    if (!isDirectory(path.join(projectRoot, directory))) {
      continue;
    }
    const entries = readdirSync(path.join(projectRoot, directory), { withFileTypes: true });
    for (const entry of entries.filter((candidate) => isPythonFile(candidate, { wholeProject }))) {
      found.add(path.posix.join(directory, entry.name));
    }
    pending.push(
      ...entries
        .filter((candidate) => isSearched(candidate, { wholeProject }))
        .map((entry) => ({ directory: path.posix.join(directory, entry.name), wholeProject })),
    );
  }
  return [...found].sort();
}

export function writeSourceListing({ projectRoot, reportRoot, project }) {
  const files = pythonSourceFiles(projectRoot, project.sourceRoots);
  const listing = path.join(reportRoot, SOURCE_LISTING);
  writeFileSync(listing, files.join('\n'));
  return { files, listing };
}

export function functionText(sources, projectRoot, { file, start, end }) {
  const lines = sourceLines(sources, projectRoot, file)
    .slice(start - 1, end)
    .map((line) => line.trimEnd());
  const indent = Math.min(
    ...lines.filter((line) => line !== '').map((line) => /^\s*/.exec(line)[0].length),
  );
  return lines.map((line) => line.slice(indent)).join('\n');
}

const EXCLUDED_DIRECTORIES = [
  '__pycache__',
  'venv',
  'node_modules',
  'site-packages',
  'build',
  'dist',
  'tests',
  'test',
  'migrations',
];
const HIDDEN_PREFIX = '.';
const COMMON_HIDDEN_DIRECTORIES = [
  '.git',
  '.venv',
  '.tox',
  '.nox',
  '.eggs',
  '.mypy_cache',
  '.ruff_cache',
  '.pytest_cache',
];

export const NON_PRODUCTION_GLOBS = [
  ...[...EXCLUDED_DIRECTORIES, ...COMMON_HIDDEN_DIRECTORIES].map((name) => `**/${name}/**`),
  ...nonProductionTestGlobs(),
];

export function nonProductionGlobs(sourceRoots) {
  return sourceRoots.includes('.')
    ? [...NON_PRODUCTION_GLOBS, ...DOCUMENTATION_DIRECTORIES.map((name) => `${name}/**`)]
    : NON_PRODUCTION_GLOBS;
}

export function existingSourceRoots(projectRoot, sourceRoots) {
  return sourceRoots.filter((root) => existsSync(path.join(projectRoot, root)));
}

function moduleName(importRoot, absoluteFile) {
  const parts = path.relative(importRoot, absoluteFile).replace(/\.py$/, '').split(path.sep);
  return parts.at(-1) === '__init__' ? parts.slice(0, -1).join('.') : parts.join('.');
}

function listDirectory(directory, skipped) {
  const entries = readdirSync(directory, { withFileTypes: true });
  function named(entry) {
    return path.join(directory, entry.name);
  }
  return {
    directories: entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith(HIDDEN_PREFIX) &&
          !EXCLUDED_DIRECTORIES.includes(entry.name) &&
          !skipped.includes(entry.name),
      )
      .map(named),
    files: entries
      .filter(
        (entry) => entry.isFile() && entry.name.endsWith('.py') && !TEST_FILE_NAME.test(entry.name),
      )
      .map(named),
  };
}

function productionFiles(top, skippedAtTop) {
  const pending = [top];
  const files = [];
  for (const directory of pending) {
    const listed = listDirectory(directory, directory === top ? skippedAtTop : []);
    pending.push(...listed.directories);
    files.push(...listed.files);
  }
  return files.sort();
}

export function listProductionModules(projectRoot, sourceRoots) {
  const seen = new Set();
  return existingSourceRoots(projectRoot, sourceRoots).flatMap((root) => {
    const [importRoot] =
      root === '.' ? [path.resolve(projectRoot)] : importRoots(projectRoot, [root]);
    const skippedAtTop = root === '.' ? DOCUMENTATION_DIRECTORIES : [];
    return productionFiles(path.resolve(projectRoot, root), skippedAtTop).flatMap((absolute) => {
      const file = path.relative(projectRoot, absolute).split(path.sep).join('/');
      const module = moduleName(importRoot, absolute);
      if (seen.has(module) || module === '') {
        return [];
      }
      seen.add(module);
      return [{ file, module, isPackage: path.basename(file) === '__init__.py' }];
    });
  });
}

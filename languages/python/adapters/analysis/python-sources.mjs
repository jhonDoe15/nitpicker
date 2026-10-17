import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sourceLines } from '../../../java/adapters/metrics/java-structure.mjs';
import {
  DOCUMENTATION_DIRECTORIES,
  importRoots,
  INSTALLED_DIRECTORIES,
  NON_SOURCE_DIRECTORIES,
  NON_SOURCE_FILES,
  TEST_DIRECTORIES,
  TEST_FILE_GLOBS,
  TOP_LEVEL_TEST_DIRECTORIES,
} from '../execution/python-project.mjs';
import { isGeneratedPython } from '../../libraries/generated-files.mjs';
import {
  DJANGO_TEST_FILES,
  isDjangoProject,
  isTestFile,
  testFileOptions,
} from '../configuration/pytest/collection-options.mjs';

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

function isSearched(entry, { directory, wholeProject }) {
  const skipped = wholeProject ? NON_SOURCE_DIRECTORIES : INSTALLED;
  const topLevelTests =
    directory === WHOLE_PROJECT && TOP_LEVEL_TEST_DIRECTORIES.includes(entry.name);
  return (
    entry.isDirectory() && !entry.name.startsWith('.') && !skipped.has(entry.name) && !topLevelTests
  );
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
        .filter((candidate) => isSearched(candidate, { directory, wholeProject }))
        .map((entry) => ({ directory: path.posix.join(directory, entry.name), wholeProject })),
    );
  }
  return [...found].sort();
}

export function writeSourceListing({ projectRoot, reportRoot, project }) {
  const files = pythonSourceFiles(projectRoot, project.sourceRoots).filter(
    (file) => !isGeneratedPython(projectRoot, file),
  );
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
  ...TEST_DIRECTORIES,
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
  ...TEST_FILE_GLOBS.map((glob) => `**/${glob}`),
];

export function nonProductionGlobs(sourceRoots, projectRoot) {
  const topLevel = [...DOCUMENTATION_DIRECTORIES, ...TOP_LEVEL_TEST_DIRECTORIES];
  return [
    ...NON_PRODUCTION_GLOBS,
    ...(isDjangoProject(projectRoot) ? DJANGO_TEST_FILES.map((name) => `**/${name}`) : []),
    ...(sourceRoots.includes('.') ? topLevel.map((name) => `${name}/**`) : []),
  ];
}

export function existingSourceRoots(projectRoot, sourceRoots) {
  return sourceRoots.filter((root) => existsSync(path.join(projectRoot, root)));
}

function moduleName(importRoot, absoluteFile) {
  const parts = path.relative(importRoot, absoluteFile).replace(/\.py$/, '').split(path.sep);
  return parts.at(-1) === '__init__' ? parts.slice(0, -1).join('.') : parts.join('.');
}

export function testFileMatcher(projectRoot) {
  const options = testFileOptions(projectRoot);
  return (file) => isTestFile(file, options);
}

function listDirectory(directory, { skipped, isTest }) {
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
      .filter((entry) => entry.isFile() && entry.name.endsWith('.py') && !isTest(named(entry)))
      .map(named),
  };
}

function productionFiles(top, { skippedAtTop, isTest }) {
  const pending = [top];
  const files = [];
  for (const directory of pending) {
    const skipped = directory === top ? skippedAtTop : [];
    const listed = listDirectory(directory, { skipped, isTest });
    pending.push(...listed.directories);
    files.push(...listed.files);
  }
  return files.sort();
}

export function listProductionModules(projectRoot, sourceRoots) {
  const seen = new Set();
  const matcher = testFileMatcher(projectRoot);
  function isTest(absolute) {
    return matcher(path.relative(projectRoot, absolute).split(path.sep).join('/'));
  }
  return existingSourceRoots(projectRoot, sourceRoots).flatMap((root) => {
    const [importRoot] =
      root === '.' ? [path.resolve(projectRoot)] : importRoots(projectRoot, [root]);
    const skippedAtTop =
      root === '.' ? [...DOCUMENTATION_DIRECTORIES, ...TOP_LEVEL_TEST_DIRECTORIES] : [];
    const top = path.resolve(projectRoot, root);
    return productionFiles(top, { skippedAtTop, isTest }).flatMap((absolute) => {
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

const OUTSIDE_SKIPPED = new Set([...INSTALLED_DIRECTORIES, 'venv', 'env', 'build', 'dist']);

function isUnder(file, root) {
  return root === '.' || file === root || file.startsWith(`${root}/`);
}

function isWalked(entry) {
  return (
    entry.isDirectory() && !entry.name.startsWith(HIDDEN_PREFIX) && !OUTSIDE_SKIPPED.has(entry.name)
  );
}

function projectFiles(projectRoot) {
  const files = [];
  const pending = [''];
  for (const directory of pending) {
    const entries = readdirSync(path.join(projectRoot, directory), { withFileTypes: true }).map(
      (entry) => ({
        entry,
        relative: directory === '' ? entry.name : `${directory}/${entry.name}`,
      }),
    );
    pending.push(...entries.filter(({ entry }) => isWalked(entry)).map(({ relative }) => relative));
    files.push(
      ...entries
        .filter(({ entry }) => entry.isFile() && entry.name.endsWith('.py'))
        .map(({ relative }) => relative),
    );
  }
  return files.sort();
}

function dottedName(file) {
  const parts = file.replace(/\.py$/u, '').split('/');
  return (parts.at(-1) === '__init__' ? parts.slice(0, -1) : parts).join('.');
}

export function listOtherModules(projectRoot, sourceRoots, production) {
  const known = new Set(production.map(({ file }) => file));
  const isTest = testFileMatcher(projectRoot);
  const roots = existingSourceRoots(projectRoot, sourceRoots).filter((root) => root !== '.');
  return projectFiles(projectRoot)
    .filter((file) => !known.has(file))
    .map((file) => {
      const inside = roots.some((root) => isUnder(file, root));
      const kind = isTest(file) ? 'test' : 'other';
      return { file, module: dottedName(file), kind, inRoots: inside };
    })
    .filter(({ module }) => module !== '');
}

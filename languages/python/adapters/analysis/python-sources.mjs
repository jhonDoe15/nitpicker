import { existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  PYTHON_SKIPPED_FOLDERS,
  skippedFolderGlobs,
} from '../../../../core/tooling/jscpd/skipped-folders.mjs';
import { sourceLines } from '../../../../shared/ingest/structure-report.mjs';
import { projectFilesUnder } from '../../../../shared/project-files/project-files.mjs';
import {
  DOCUMENTATION_DIRECTORIES,
  importRoots,
  INSTALLED_DIRECTORIES,
  NON_SOURCE_DIRECTORIES,
  NON_SOURCE_FILES,
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

function isPythonFile(file, { wholeProject }) {
  const name = path.basename(file);
  return name.endsWith('.py') && !(wholeProject && NON_SOURCE_FILES.has(name));
}

function isSkippedDirectory(entry, { wholeProject }) {
  const skipped = wholeProject ? NON_SOURCE_DIRECTORIES : INSTALLED;
  return entry.name.startsWith('.') || skipped.has(entry.name);
}

function relativePosix(projectRoot, absolute) {
  return path.relative(projectRoot, absolute).split(path.sep).join('/');
}

function isDirectory(absolute) {
  return existsSync(absolute) && statSync(absolute).isDirectory();
}

export function pythonSourceFiles(projectRoot, sourceRoots) {
  const found = sourceRoots
    .filter((directory) => isDirectory(path.join(projectRoot, directory)))
    .flatMap((directory) => {
      const walked = { wholeProject: directory === WHOLE_PROJECT };
      return projectFilesUnder(path.join(projectRoot, directory), {
        skipDirectory: (_, entry) => isSkippedDirectory(entry, walked),
      })
        .filter((file) => isPythonFile(file, walked))
        .map((file) => relativePosix(projectRoot, file));
    });
  return [...new Set(found)].sort();
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

const DEPENDENCY_DIRECTORIES = ['__pycache__', 'venv', 'node_modules', 'site-packages'];
const EXCLUDED_DIRECTORIES = [...DEPENDENCY_DIRECTORIES, ...PYTHON_SKIPPED_FOLDERS];
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

const TEST_FILE_GLOBS = ['**/test_*.py', '**/*_test.py', '**/conftest.py'];

function productionGlobs(skippedFolders) {
  return [
    ...skippedFolderGlobs([
      ...DEPENDENCY_DIRECTORIES,
      ...skippedFolders,
      ...COMMON_HIDDEN_DIRECTORIES,
    ]),
    ...TEST_FILE_GLOBS,
  ];
}

export const NON_PRODUCTION_GLOBS = productionGlobs(PYTHON_SKIPPED_FOLDERS);

export function nonProductionGlobs(
  sourceRoots,
  projectRoot,
  skippedFolders = PYTHON_SKIPPED_FOLDERS,
) {
  const globs =
    skippedFolders === PYTHON_SKIPPED_FOLDERS
      ? NON_PRODUCTION_GLOBS
      : productionGlobs(skippedFolders);
  return [
    ...globs,
    ...(isDjangoProject(projectRoot) ? DJANGO_TEST_FILES.map((name) => `**/${name}`) : []),
    ...(sourceRoots.includes('.') ? DOCUMENTATION_DIRECTORIES.map((name) => `${name}/**`) : []),
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

function productionFiles(top, { skippedAtTop, isTest }) {
  function isSkipped(absolute, entry) {
    return (
      entry.name.startsWith(HIDDEN_PREFIX) ||
      EXCLUDED_DIRECTORIES.includes(entry.name) ||
      (path.dirname(absolute) === top && skippedAtTop.includes(entry.name))
    );
  }
  return projectFilesUnder(top, { skipDirectory: isSkipped })
    .filter((file) => file.endsWith('.py') && !isTest(file))
    .sort();
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
    const skippedAtTop = root === '.' ? DOCUMENTATION_DIRECTORIES : [];
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

export function isUnder(file, root) {
  return root === '.' || file === root || file.startsWith(`${root}/`);
}

function isOutsideSkipped(entry) {
  return entry.name.startsWith(HIDDEN_PREFIX) || OUTSIDE_SKIPPED.has(entry.name);
}

function projectFiles(projectRoot) {
  return projectFilesUnder(projectRoot, { skipDirectory: (_, entry) => isOutsideSkipped(entry) })
    .filter((file) => file.endsWith('.py'))
    .map((file) => relativePosix(projectRoot, file))
    .sort();
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

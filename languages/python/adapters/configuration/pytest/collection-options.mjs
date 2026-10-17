import { existsSync } from 'node:fs';
import path from 'node:path';
import { readPythonDependencies } from '../../../libraries/python-dependencies.mjs';
import { readPytestConfig } from './pytest-config.mjs';
import { parseToml, readProjectFile } from '../project-files.mjs';
import { TOP_LEVEL_TEST_DIRECTORIES } from '../../execution/python-project.mjs';

const TEST_DIRECTORIES = new Set(['tests', 'test']);
const STANDARD_TEST_FILES = ['test_*.py', '*_test.py'];
export const DJANGO_TEST_FILES = ['tests.py', 'tests_*.py', '*_tests.py'];
const DJANGO_DISTRIBUTIONS = new Set(['django', 'pytest-django', 'djangorestframework']);
const DJANGO_ENTRY = 'manage.py';
const PYPROJECT = 'pyproject.toml';
const BROAD_PROBES = ['a.py', 'service.py', 'models.py'];
const VALUE_FLAGS = ['--deselect', '--ignore', '--ignore-glob'];

const REGEXP_SPECIALS = /[.+^${}()|[\]\\]/gu;

export function matchesGlob(name, pattern) {
  const source = pattern
    .replaceAll(REGEXP_SPECIALS, String.raw`\$&`)
    .replaceAll('*', '.*')
    .replaceAll('?', '.');
  return new RegExp(`^${source}$`, 'su').test(name);
}

function matchesAny(name, patterns) {
  return patterns.some((pattern) => matchesGlob(name, pattern));
}

function isBroad(pattern) {
  return BROAD_PROBES.every((name) => matchesGlob(name, pattern));
}

function folderPattern(root) {
  return root.replace(/^\.\//u, '').replace(/\/+$/u, '');
}

function underTestPath(parts, testpaths) {
  const folders = parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
  return testpaths.some((root) =>
    folders.some((folder) => matchesGlob(folder, folderPattern(root))),
  );
}

export function isTestFile(file, { pythonFiles, testpaths = [], django = false }) {
  const parts = file.split('/');
  const name = parts.at(-1) ?? '';
  const broad = pythonFiles.some((pattern) => isBroad(pattern));
  const patterns = [
    ...STANDARD_TEST_FILES,
    ...(django ? DJANGO_TEST_FILES : []),
    ...pythonFiles.filter((pattern) => !isBroad(pattern)),
  ];
  return (
    name === 'conftest.py' ||
    parts.slice(0, -1).some((part) => TEST_DIRECTORIES.has(part)) ||
    (parts.length > 1 && TOP_LEVEL_TEST_DIRECTORIES.includes(parts[0])) ||
    (broad && underTestPath(parts, testpaths)) ||
    matchesAny(name, patterns)
  );
}

function declaresDjango(projectRoot) {
  const pyproject = readProjectFile(projectRoot, PYPROJECT);
  if (pyproject !== undefined && parseToml(pyproject).kind === 'invalid') {
    return false;
  }
  return readPythonDependencies(projectRoot).dependencies.some(({ normalized }) =>
    DJANGO_DISTRIBUTIONS.has(normalized),
  );
}

export function isDjangoProject(projectRoot, config = readPytestConfig(projectRoot)) {
  return (
    config.djangoSettingsModule !== undefined ||
    existsSync(path.join(projectRoot, DJANGO_ENTRY)) ||
    declaresDjango(projectRoot)
  );
}

export function testFileOptions(projectRoot) {
  const config = readPytestConfig(projectRoot);
  return { ...collectionOptions(config), django: isDjangoProject(projectRoot, config) };
}

function flagValues(words, flag) {
  return words.flatMap((word, index) => {
    if (word === flag) {
      return words[index + 1] === undefined ? [] : [words[index + 1]];
    }
    return word.startsWith(`${flag}=`) ? [word.slice(flag.length + 1)] : [];
  });
}

function keywordExpressions(words) {
  return words.flatMap((word, index) => {
    if (word === '-k') {
      return words[index + 1] === undefined ? [] : [words[index + 1]];
    }
    return word.startsWith('-k') && !word.startsWith('--') ? [word.slice(2)] : [];
  });
}

export function collectionOptions(config) {
  const [deselected, ignored, ignoredGlobs] = VALUE_FLAGS.map((flag) =>
    flagValues(config.addopts, flag),
  );
  return {
    pythonFiles: config.pythonFiles,
    pythonClasses: config.pythonClasses,
    pythonFunctions: config.pythonFunctions,
    norecursedirs: config.norecursedirs,
    testpaths: config.testpaths,
    deselected,
    ignored,
    ignoredGlobs,
    keywords: keywordExpressions(config.addopts),
  };
}

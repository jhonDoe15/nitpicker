import { existsSync } from 'node:fs';
import path from 'node:path';
import type {
  CollectionOptions,
  PytestConfig,
  TestFileOptions,
  TestFileSettings,
} from '../typed/config-types.mts';
import { escapeRegExp as untypedEscape } from '../../../../../shared/paths/glob.mjs';
import { readPythonDependencies } from '../../../libraries/python-dependencies.mts';
import { readPytestConfig } from './pytest-config.mts';
import { TOP_LEVEL_TEST_DIRECTORIES } from '../../execution/python-project.mts';

const TEST_DIRECTORIES = new Set(['tests', 'test']);
const STANDARD_TEST_FILES = ['test_*.py', '*_test.py'];
export const DJANGO_TEST_FILES = ['tests.py', 'tests_*.py', '*_tests.py'];
const DJANGO_DISTRIBUTIONS = new Set(['django', 'pytest-django', 'djangorestframework']);
const DJANGO_ENTRY = 'manage.py';
const BROAD_PROBES = ['a.py', 'service.py', 'models.py'];
const VALUE_FLAGS = ['--deselect', '--ignore', '--ignore-glob'];

const escapeRegExp: (value: string) => string = untypedEscape;

export function matchesGlob(name: string, pattern: string): boolean {
  const source = escapeRegExp(pattern)
    .replaceAll(String.raw`\*`, '.*')
    .replaceAll(String.raw`\?`, '.');
  return new RegExp(`^${source}$`, 'su').test(name);
}

function matchesAny(name: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesGlob(name, pattern));
}

function isBroad(pattern: string): boolean {
  return BROAD_PROBES.every((name) => matchesGlob(name, pattern));
}

function folderPattern(root: string): string {
  return root.replace(/^\.\//u, '').replace(/\/+$/u, '');
}

export function underTestPath(parts: readonly string[], testpaths: readonly string[]): boolean {
  const folders = parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
  return testpaths.some((root) =>
    folders.some((folder) => matchesGlob(folder, folderPattern(root))),
  );
}

export function isTestFile(
  file: string,
  { pythonFiles, testpaths = [], django }: TestFileSettings,
): boolean {
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
    (parts.length > 1 && TOP_LEVEL_TEST_DIRECTORIES.includes(parts[0] ?? '')) ||
    (broad && underTestPath(parts, testpaths)) ||
    matchesAny(name, patterns)
  );
}

export function isCollectedTestFile(
  file: string,
  { pythonFiles, django }: TestFileSettings,
): boolean {
  const name = file.split('/').at(-1) ?? '';
  const patterns = [...pythonFiles, ...(django ? DJANGO_TEST_FILES : [])];
  return name === 'conftest.py' || matchesAny(name, patterns);
}

export function isDjangoProject(
  projectRoot: string,
  config: PytestConfig = readPytestConfig(projectRoot),
): boolean {
  return (
    config.djangoSettingsModule !== undefined ||
    existsSync(path.join(projectRoot, DJANGO_ENTRY)) ||
    readPythonDependencies(projectRoot).dependencies.some(({ normalized }) =>
      DJANGO_DISTRIBUTIONS.has(normalized),
    )
  );
}

export function testFileOptions(projectRoot: string): TestFileOptions {
  const config = readPytestConfig(projectRoot);
  return { ...collectionOptions(config), django: isDjangoProject(projectRoot, config) };
}

function valuesOf(
  words: readonly string[],
  {
    flag,
    inline,
  }: { readonly flag: string; readonly inline: (word: string) => string | undefined },
): string[] {
  return words.flatMap((word, index) => {
    const next = words[index + 1];
    if (word === flag) {
      return next === undefined ? [] : [next];
    }
    const value = inline(word);
    return value === undefined ? [] : [value];
  });
}

function flagValues(words: readonly string[], flag: string): string[] {
  return valuesOf(words, {
    flag,
    inline: (word) => (word.startsWith(`${flag}=`) ? word.slice(flag.length + 1) : undefined),
  });
}

function shortValues(words: readonly string[], flag: string): string[] {
  return valuesOf(words, {
    flag,
    inline: (word) => (word.startsWith(flag) && !word.startsWith('--') ? word.slice(2) : undefined),
  });
}

export function collectionOptions(config: PytestConfig): CollectionOptions {
  const [deselected = [], ignored = [], ignoredGlobs = []] = VALUE_FLAGS.map((flag) =>
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
    keywords: shortValues(config.addopts, '-k'),
    marks: shortValues(config.addopts, '-m'),
  };
}

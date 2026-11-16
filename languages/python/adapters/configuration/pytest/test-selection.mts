import { readInside } from '../../../../../shared/conventions/read-inside.mjs';
import type {
  ExcludesEntry,
  RootsEntry,
  SelectionEntry,
  TestFileOptions,
} from '../typed/config-types.mts';
import { listProductionModules } from '../../analysis/python-sources.mts';
import { mutmutDoNotMutate } from '../../mutation/mutation-markers.mts';
import {
  isCollectedTestFile,
  matchesGlob,
  testFileOptions,
  underTestPath,
} from './collection-options.mts';

const PYTEST_FILES = [
  'pytest.toml',
  '.pytest.toml',
  'pytest.ini',
  '.pytest.ini',
  'pyproject.toml',
  'tox.ini',
  'setup.cfg',
];
const DEFAULT_FILE = 'pyproject.toml';
const NODE_SEPARATOR = '::';

function fileHolds(projectRoot: string, file: string, word: string): boolean {
  const text = readInside(projectRoot, file, 'utf8');
  return text?.toString().includes(word) === true;
}

function configFileWith(projectRoot: string, word: string): string {
  return PYTEST_FILES.find((file) => fileHolds(projectRoot, file, word)) ?? DEFAULT_FILE;
}

function ignoredPath(file: string, pattern: string): boolean {
  const name = pattern.split(NODE_SEPARATOR)[0] ?? '';
  return file === name || file.startsWith(`${name}/`) || matchesGlob(file, name);
}

function testpathsEntry(projectRoot: string, options: TestFileOptions): RootsEntry {
  const { testpaths } = options;
  return {
    type: 'roots',
    key: 'pytest:testpaths',
    file: configFileWith(projectRoot, 'testpaths'),
    label: 'pytest testpaths',
    kind: 'test-paths',
    roots: testpaths.length === 0 ? undefined : testpaths,
    contains: (file: string, root: string) => underTestPath(file.split('/'), [root]),
    applies: (file: string) => isCollectedTestFile(file, options),
  };
}

function ignoredEntry(projectRoot: string, options: TestFileOptions): ExcludesEntry {
  const patterns = [...options.ignored, ...options.ignoredGlobs];
  return {
    type: 'excludes',
    key: 'pytest:addopts-ignore',
    file: configFileWith(projectRoot, 'addopts'),
    label: 'pytest addopts --ignore and --ignore-glob',
    patterns,
    covers: (file: string, pattern: string) =>
      isCollectedTestFile(file, options) && ignoredPath(file, pattern),
  };
}

function mutationEntry(projectRoot: string, sourceRoots: readonly string[]): ExcludesEntry[] {
  const settings = mutmutDoNotMutate(projectRoot);
  if (settings === undefined) {
    return [];
  }
  const production = new Set(
    listProductionModules(projectRoot, sourceRoots).map(({ file }: { file: string }) => file),
  );
  return [
    {
      type: 'excludes',
      key: 'mutmut:do_not_mutate',
      file: settings.file,
      label: 'mutmut do_not_mutate',
      patterns: settings.patterns,
      covers: (file: string, pattern: string) =>
        production.has(file) && settings.matches(file, pattern),
    },
  ];
}

export function readPythonSelection(
  projectRoot: string,
  sourceRoots: readonly string[],
): SelectionEntry[] {
  const options = testFileOptions(projectRoot);
  return [
    testpathsEntry(projectRoot, options),
    ignoredEntry(projectRoot, options),
    ...mutationEntry(projectRoot, sourceRoots),
  ];
}

import { readInside } from '../../../../../shared/conventions/read-inside.mjs';
import { listProductionModules } from '../../analysis/python-sources.mjs';
import { mutmutDoNotMutate } from '../../mutation/mutation-markers.mjs';
import {
  isCollectedTestFile,
  matchesGlob,
  testFileOptions,
  underTestPath,
} from './collection-options.mjs';

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

function configFileWith(projectRoot, word) {
  return (
    PYTEST_FILES.find((file) => readInside(projectRoot, file, 'utf8')?.includes(word)) ??
    DEFAULT_FILE
  );
}

function ignoredPath(file, pattern) {
  const name = pattern.split(NODE_SEPARATOR)[0];
  return file === name || file.startsWith(`${name}/`) || matchesGlob(file, name);
}

function testpathsEntry(projectRoot, options) {
  const { testpaths } = options;
  return {
    type: 'roots',
    key: 'pytest:testpaths',
    file: configFileWith(projectRoot, 'testpaths'),
    label: 'pytest testpaths',
    roots: testpaths.length === 0 ? undefined : testpaths,
    contains: (file, root) => underTestPath(file.split('/'), [root]),
    applies: (file) => isCollectedTestFile(file, options),
  };
}

function ignoredEntry(projectRoot, options) {
  const patterns = [...options.ignored, ...options.ignoredGlobs];
  return {
    type: 'excludes',
    key: 'pytest:addopts-ignore',
    file: configFileWith(projectRoot, 'addopts'),
    label: 'pytest addopts --ignore and --ignore-glob',
    patterns,
    covers: (file, pattern) => isCollectedTestFile(file, options) && ignoredPath(file, pattern),
  };
}

function mutationEntry(projectRoot, sourceRoots) {
  const settings = mutmutDoNotMutate(projectRoot);
  if (settings === undefined) {
    return [];
  }
  const production = new Set(
    listProductionModules(projectRoot, sourceRoots).map(({ file }) => file),
  );
  return [
    {
      type: 'excludes',
      key: 'mutmut:do_not_mutate',
      file: settings.file,
      label: 'mutmut do_not_mutate',
      patterns: settings.patterns,
      covers: (file, pattern) => production.has(file) && settings.matches(file, pattern),
    },
  ];
}

export function readPythonSelection(projectRoot, sourceRoots) {
  const options = testFileOptions(projectRoot);
  return [
    testpathsEntry(projectRoot, options),
    ignoredEntry(projectRoot, options),
    ...mutationEntry(projectRoot, sourceRoots),
  ];
}

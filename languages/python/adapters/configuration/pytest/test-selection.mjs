import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { listProductionModules } from '../../analysis/python-sources.mjs';
import { mutmutDoNotMutate } from '../../mutation/mutation-markers.mjs';
import { isTestFile, matchesGlob, testFileOptions } from './collection-options.mjs';

const PYTEST_FILES = [
  'pytest.toml',
  '.pytest.toml',
  'pytest.ini',
  '.pytest.ini',
  'pyproject.toml',
  'tox.ini',
  'setup.cfg',
];
const NODE_SEPARATOR = '::';

function configFileWith(projectRoot, word) {
  return (
    PYTEST_FILES.find(
      (file) =>
        existsSync(path.join(projectRoot, file)) &&
        readFileSync(path.join(projectRoot, file), 'utf8').includes(word),
    ) ?? PYTEST_FILES.at(-2)
  );
}

function folderPattern(root) {
  return root.replace(/^\.\//u, '').replace(/\/+$/u, '');
}

function underTestPath(file, root) {
  const parts = file.split('/');
  return parts
    .slice(0, -1)
    .some((_, index) => matchesGlob(parts.slice(0, index + 1).join('/'), folderPattern(root)));
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
    contains: underTestPath,
    applies: (file) => isTestFile(file, { ...options, testpaths: [] }),
  };
}

function ignoredEntry(projectRoot, options) {
  const patterns = [...options.ignored, ...options.ignoredGlobs, ...options.deselected];
  return {
    type: 'excludes',
    key: 'pytest:addopts-ignore',
    file: configFileWith(projectRoot, 'addopts'),
    label: 'pytest addopts --ignore, --ignore-glob and --deselect',
    patterns,
    covers: (file, pattern) =>
      isTestFile(file, { ...options, testpaths: [] }) && ignoredPath(file, pattern),
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

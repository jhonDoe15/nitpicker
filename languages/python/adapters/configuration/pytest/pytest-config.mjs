import { isTable, parseToml, readProjectFile } from '../project-files.mjs';
import { parseIni } from './ini-file.mjs';

export const DEFAULT_PYTHON_FILES = ['test_*.py', '*_test.py'];
const DEFAULT_PYTHON_CLASSES = ['Test'];
const DEFAULT_PYTHON_FUNCTIONS = ['test'];
export const DEFAULT_NORECURSEDIRS = [
  '*.egg',
  '.*',
  '_darcs',
  'build',
  'CVS',
  'dist',
  'node_modules',
  'venv',
  '{arch}',
];
const OWN_TOML = ['pytest.toml', '.pytest.toml'];
const INI_SOURCES = [
  { file: 'pytest.ini', section: 'pytest', always: true },
  { file: '.pytest.ini', section: 'pytest', always: true },
  { file: 'pyproject.toml', section: undefined, always: false },
  { file: 'tox.ini', section: 'pytest', always: false },
  { file: 'setup.cfg', section: 'tool:pytest', always: false },
];

function normalized(options) {
  return Object.fromEntries(
    Object.entries(options).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map(String) : String(value),
    ]),
  );
}

function pyprojectOptions(text) {
  const parsed = parseToml(text);
  const pytest = parsed.kind === 'table' ? parsed.table.tool?.pytest : undefined;
  if (!isTable(pytest)) {
    return undefined;
  }
  const { ini_options: legacy, ...native } = pytest;
  return normalized({ ...(isTable(legacy) ? legacy : {}), ...native });
}

function tomlOptions(text) {
  const parsed = parseToml(text);
  const table = parsed.kind === 'table' ? (parsed.table.pytest ?? parsed.table) : {};
  return normalized(isTable(table) ? table : {});
}

function iniOptions(text, section) {
  const options = parseIni(text).get(section);
  return options === undefined ? undefined : Object.fromEntries(options);
}

function sourceOptions(projectRoot, { file, section, always }) {
  const text = readProjectFile(projectRoot, file);
  if (text === undefined) {
    return undefined;
  }
  const found =
    file === 'pyproject.toml' ? pyprojectOptions(text) : iniOptions(text, section ?? 'pytest');
  return found ?? (always ? {} : undefined);
}

function configuredOptions(projectRoot) {
  for (const file of OWN_TOML) {
    const text = readProjectFile(projectRoot, file);
    if (text !== undefined) {
      return tomlOptions(text);
    }
  }
  for (const source of INI_SOURCES) {
    const found = sourceOptions(projectRoot, source);
    if (found !== undefined) {
      return found;
    }
  }
  return {};
}

function words(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === 'string' ? value.split(/\s+/u).filter((entry) => entry !== '') : [];
}

function listOr(value, fallback) {
  const list = words(value);
  return list.length === 0 ? fallback : list;
}

const SHELL_WORD = /(?:[^\s"']|"[^"]*"?|'[^']*'?)+/gu;
const SHELL_QUOTED = /"([^"]*)"?|'([^']*)'?/gu;

export function shellWords(text) {
  return [...text.matchAll(SHELL_WORD)].map(([word]) =>
    word.replaceAll(SHELL_QUOTED, (_quoted, double, single) => double ?? single),
  );
}

export function readPytestConfig(projectRoot) {
  const options = configuredOptions(projectRoot);
  const addopts = options.addopts;
  return {
    pythonFiles: listOr(options.python_files, DEFAULT_PYTHON_FILES),
    pythonClasses: listOr(options.python_classes, DEFAULT_PYTHON_CLASSES),
    pythonFunctions: listOr(options.python_functions, DEFAULT_PYTHON_FUNCTIONS),
    norecursedirs: listOr(options.norecursedirs, DEFAULT_NORECURSEDIRS),
    testpaths: words(options.testpaths),
    addopts: Array.isArray(addopts) ? addopts : shellWords(addopts ?? ''),
  };
}

export function readPythonFiles(projectRoot) {
  return readPytestConfig(projectRoot).pythonFiles;
}

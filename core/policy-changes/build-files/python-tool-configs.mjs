import { existsSync } from 'node:fs';
import path from 'node:path';
import { readInside } from '../../../shared/conventions/read-inside.mjs';
import { parseJsonc } from '../../../shared/jsonc/jsonc.mjs';
import { parseIni } from '../../../languages/python/adapters/configuration/ini-parser.mjs';
import {
  blackConfigFiles,
  ruffConfigFiles,
} from '../../../languages/python/adapters/formatting/project-format-config.mjs';
import { readProjectPyright } from '../../../languages/python/adapters/project-tools/pyright/pyright-project-config.mjs';
import { readCoverageSettings } from '../../../languages/python/adapters/configuration/coverage-config/python-coverage-config.mjs';
import { readMypyConfig } from '../../../languages/python/adapters/configuration/mypy/mypy-config.mjs';
import { readMutmutConfig } from '../../../languages/python/adapters/project-tools/mutmut/mutmut-config.mjs';
import {
  attempt,
  parseToml,
} from '../../../languages/python/adapters/project-tools/project-tool-layers.mjs';

export const PYTHON_TOOLS = ['ruff', 'black', 'pyright', 'mypy', 'mutmut', 'coverage'];
const PYPROJECT = 'pyproject.toml';
const SETUP_CFG = 'setup.cfg';
const TOX_INI = 'tox.ini';
const COVERAGERC = '.coveragerc';
const MYPY_FILES = ['mypy.ini', '.mypy.ini'];
const PYRIGHT_CHECKERS = ['pyright', 'basedpyright'];
const MYPY_SECTION = /^mypy(?:-|$)/u;
const TOML_TABLES = {
  ruff: ['ruff'],
  black: ['black'],
  pyright: ['pyright', 'basedpyright'],
  mypy: ['mypy'],
  mutmut: ['mutmut'],
  coverage: ['coverage'],
};
const SHARED_INI_SECTIONS = {
  mypy: { matches: (name) => MYPY_SECTION.test(name), required: (names) => names.includes('mypy') },
  mutmut: { matches: (name) => name === 'mutmut', required: (names) => names.includes('mutmut') },
  coverage: {
    matches: (name) => name.startsWith('coverage:'),
    required: (names) => names.length > 0,
  },
};
const RUNTIME_READERS = {
  mypy: readMypyConfig,
  mutmut: readMutmutConfig,
  coverage: readCoverageSettings,
};

function sortedKeys(_key, value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.keys(value)
          .toSorted()
          .map((key) => [key, value[key]]),
      )
    : value;
}

function iniSections(text, matches) {
  return Object.fromEntries(
    [...parseIni(text)]
      .filter(([name]) => matches(name))
      .map(([name, options]) => [name, Object.fromEntries(options)]),
  );
}

function pyprojectPart(tool, text) {
  const tables = parseToml(text).tool ?? {};
  const kept = TOML_TABLES[tool].filter((name) => tables[name] !== undefined);
  return kept.length === 0
    ? undefined
    : Object.fromEntries(kept.map((name) => [name, tables[name]]));
}

function sharedIniPart(tool, text) {
  const shared = SHARED_INI_SECTIONS[tool];
  const sections = shared === undefined ? {} : iniSections(text, shared.matches);
  return shared?.required(Object.keys(sections)) === true ? sections : undefined;
}

function relevantPart(tool, file, text) {
  const name = path.posix.basename(file);
  if (name === PYPROJECT) {
    return pyprojectPart(tool, text);
  }
  if (name === SETUP_CFG || name === TOX_INI) {
    return sharedIniPart(tool, text);
  }
  if (MYPY_FILES.includes(name)) {
    return iniSections(text, (section) => MYPY_SECTION.test(section));
  }
  if (name === COVERAGERC) {
    return iniSections(text, () => true);
  }
  return name.endsWith('.json') ? parseJsonc(text) : parseToml(text);
}

function readPart(tool, file, text) {
  try {
    return { kind: 'read', part: relevantPart(tool, file, text) };
  } catch (error) {
    return { kind: 'unreadable', error };
  }
}

function pythonConfigText(tool, file, text) {
  const read = readPart(tool, file, text);
  if (read.kind === 'unreadable') {
    return text;
  }
  return read.part === undefined ? undefined : JSON.stringify(read.part, sortedKeys);
}

function checkoutOf(root) {
  const start = path.resolve(root);
  const parts = start.split(path.sep);
  const found = parts
    .map((_, index) => parts.slice(0, parts.length - index).join(path.sep) || path.sep)
    .find((directory) => existsSync(path.join(directory, '.git')));
  return found ?? start;
}

function labelsOf(checkout, files) {
  return files.map((file) => path.relative(checkout, file).split(path.sep).join('/'));
}

function readFile(tool, root) {
  const { value, error } = attempt(() => RUNTIME_READERS[tool](root));
  const file = value?.file ?? error?.file;
  return file === undefined ? [] : [path.join(root, file)];
}

function candidatesOf(tool, root) {
  if (tool === 'ruff') {
    return ruffConfigFiles(root);
  }
  if (tool === 'black') {
    return blackConfigFiles(root);
  }
  if (tool === 'pyright') {
    const files = PYRIGHT_CHECKERS.flatMap(
      (checker) => readProjectPyright(root, checker, { upward: true })?.files ?? [],
    );
    return [...new Set(files)];
  }
  return readFile(tool, root);
}

export function pythonConfigEntries(tool, root) {
  const checkout = checkoutOf(root);
  return labelsOf(checkout, candidatesOf(tool, root)).flatMap((file) => {
    const content = readInside(checkout, file, 'utf8');
    const text = content === undefined ? undefined : pythonConfigText(tool, file, content);
    return text === undefined ? [] : [{ file, text, content }];
  });
}

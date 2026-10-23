import path from 'node:path';
import { readInside } from '../../../shared/conventions/read-inside.mjs';
import { parseJsonc } from '../../../shared/jsonc/jsonc.mjs';
import { parseIni } from '../../../languages/python/adapters/configuration/ini-parser.mjs';
import {
  blackConfigFiles,
  ruffConfigFiles,
} from '../../../languages/python/adapters/formatting/project-format-config.mjs';
import { readProjectPyright } from '../../../languages/python/adapters/project-tools/pyright/pyright-project-config.mjs';
import { parseToml } from '../../../languages/python/adapters/project-tools/project-tool-layers.mjs';

export const IMPORT_LINTER = 'import-linter';

export const PYTHON_TOOLS = [
  'ruff',
  'black',
  'pyright',
  'mypy',
  'mutmut',
  'coverage',
  IMPORT_LINTER,
];
const PYPROJECT = 'pyproject.toml';
const SETUP_CFG = 'setup.cfg';
const TOX_INI = 'tox.ini';
const COVERAGERC = '.coveragerc';
const IMPORT_LINTER_FILE = '.importlinter';
const IMPORT_LINTER_SECTION = /^importlinter(?::|$)/u;
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
  [IMPORT_LINTER]: ['importlinter'],
};
const SHARED_INI_SECTIONS = {
  mypy: { matches: (name) => MYPY_SECTION.test(name), required: (names) => names.includes('mypy') },
  mutmut: { matches: (name) => name === 'mutmut', required: (names) => names.includes('mutmut') },
  coverage: {
    matches: (name) => name.startsWith('coverage:'),
    required: (names) => names.length > 0,
  },
  [IMPORT_LINTER]: {
    matches: (name) => IMPORT_LINTER_SECTION.test(name),
    required: (names) => names.includes('importlinter'),
  },
};
const FIRST_FILES = {
  mypy: [...MYPY_FILES, PYPROJECT, SETUP_CFG],
  mutmut: [PYPROJECT, SETUP_CFG],
  coverage: [COVERAGERC, SETUP_CFG, TOX_INI, PYPROJECT],
};

function sortedKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortedKeys);
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value)
        .toSorted()
        .map((key) => [key, sortedKeys(value[key])]),
    );
  }
  return value;
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
  if ([SETUP_CFG, TOX_INI, IMPORT_LINTER_FILE].includes(name)) {
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

export function pythonConfigText(tool, file, text) {
  try {
    const part = relevantPart(tool, file, text);
    return part === undefined ? undefined : JSON.stringify(sortedKeys(part));
  } catch {
    return text;
  }
}

function relativeTo(root, files) {
  return files.map((file) => path.relative(root, file).split(path.sep).join('/'));
}

function textOf(root, file) {
  return readInside(root, file, 'utf8');
}

function firstConfigured(tool, root, names) {
  const found = names.find((name) => {
    const text = textOf(root, name);
    return text !== undefined && pythonConfigText(tool, name, text) !== undefined;
  });
  return found === undefined ? [] : [found];
}

function candidatesOf(tool, root) {
  if (tool === 'ruff') {
    return relativeTo(root, ruffConfigFiles(root));
  }
  if (tool === 'black') {
    return relativeTo(root, blackConfigFiles(root));
  }
  if (tool === 'pyright') {
    const files = PYRIGHT_CHECKERS.flatMap(
      (checker) => readProjectPyright(root, checker, { upward: true })?.files ?? [],
    );
    return relativeTo(root, [...new Set(files)]);
  }
  if (tool === IMPORT_LINTER) {
    return [IMPORT_LINTER_FILE, SETUP_CFG, TOX_INI, PYPROJECT].filter(
      (name) => firstConfigured(tool, root, [name]).length > 0,
    );
  }
  return firstConfigured(tool, root, FIRST_FILES[tool]);
}

export function pythonConfigEntries(tool, root) {
  return candidatesOf(tool, root).flatMap((file) => {
    const content = textOf(root, file);
    const text = content === undefined ? undefined : pythonConfigText(tool, file, content);
    return text === undefined ? [] : [[file, text]];
  });
}

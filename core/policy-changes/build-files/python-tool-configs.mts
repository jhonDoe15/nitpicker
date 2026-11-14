import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  blackConfigFiles,
  parseIni,
  parseJsonc,
  parseToml,
  readCoverageSettings,
  readMutmutConfig,
  readMypyConfig,
  readProjectPyright,
  ruffConfigFiles,
} from '../types/python-views.mts';
import type { RuntimeConfig } from '../types/python-views.mts';
import { fieldOf, fieldsOf } from '../../../shared/values/readers.mts';
import { attempt, readInside } from '../types/tool-views.mts';

type ConfigRead =
  | { readonly kind: 'read'; readonly part: unknown }
  | { readonly kind: 'unreadable'; readonly error: unknown };
type SharedSection = {
  readonly matches: (name: string) => boolean;
  readonly required: (names: readonly string[]) => boolean;
};

const BLACK = 'black';
const PYRIGHT = 'pyright';
const MUTMUT = 'mutmut';
export const PYTHON_TOOLS = ['ruff', BLACK, PYRIGHT, 'mypy', MUTMUT, 'coverage'];
const PYPROJECT = 'pyproject.toml';
const SETUP_CFG = 'setup.cfg';
const TOX_INI = 'tox.ini';
const COVERAGERC = '.coveragerc';
const MYPY_FILES = ['mypy.ini', '.mypy.ini'];
const PYRIGHT_CHECKERS = [PYRIGHT, 'basedpyright'];
const MYPY_SECTION = /^mypy(?:-|$)/u;
const TOML_TABLES: Readonly<Record<string, readonly string[]>> = {
  ruff: ['ruff'],
  black: [BLACK],
  pyright: [PYRIGHT, 'basedpyright'],
  mypy: ['mypy'],
  mutmut: [MUTMUT],
  coverage: ['coverage'],
};
const SHARED_INI_SECTIONS: Readonly<Record<string, SharedSection>> = {
  mypy: { matches: (name) => MYPY_SECTION.test(name), required: (names) => names.includes('mypy') },
  mutmut: { matches: (name) => name === MUTMUT, required: (names) => names.includes(MUTMUT) },
  coverage: {
    matches: (name) => name.startsWith('coverage:'),
    required: (names) => names.length > 0,
  },
};
const RUNTIME_READERS: Readonly<Record<string, (root: string) => RuntimeConfig | undefined>> = {
  mypy: readMypyConfig,
  mutmut: readMutmutConfig,
  coverage: readCoverageSettings,
};

function sortedKeys(_key: string, value: unknown): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.keys(value)
          .toSorted()
          .map((key) => [key, fieldOf(value, key)]),
      )
    : value;
}

function iniSections(
  text: string,
  matches: (name: string) => boolean,
): Record<string, Record<string, string>> {
  return Object.fromEntries(
    [...parseIni(text)]
      .filter(([name]) => matches(name))
      .map(([name, options]) => [name, Object.fromEntries(options)]),
  );
}

function pyprojectPart(tool: string, text: string): Record<string, unknown> | undefined {
  const tables = fieldsOf(fieldOf(parseToml(text), 'tool'));
  const kept = (TOML_TABLES[tool] ?? []).filter((name) => tables[name] !== undefined);
  return kept.length === 0
    ? undefined
    : Object.fromEntries(kept.map((name) => [name, tables[name]]));
}

function sharedIniPart(
  tool: string,
  text: string,
): Record<string, Record<string, string>> | undefined {
  const shared = SHARED_INI_SECTIONS[tool];
  const sections = shared === undefined ? {} : iniSections(text, shared.matches);
  return shared?.required(Object.keys(sections)) === true ? sections : undefined;
}

function relevantPart(tool: string, file: string, text: string): unknown {
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

function readPart(tool: string, file: string, text: string): ConfigRead {
  try {
    return { kind: 'read', part: relevantPart(tool, file, text) };
  } catch (error) {
    return { kind: 'unreadable', error };
  }
}

function pythonConfigText(tool: string, file: string, text: string): string | undefined {
  const read = readPart(tool, file, text);
  if (read.kind === 'unreadable') {
    return text;
  }
  return read.part === undefined ? undefined : JSON.stringify(read.part, sortedKeys);
}

function checkoutOf(root: string): string {
  const start = path.resolve(root);
  const parts = start.split(path.sep);
  const found = parts
    .map((_, index) => parts.slice(0, parts.length - index).join(path.sep) || path.sep)
    .find((directory) => existsSync(path.join(directory, '.git')));
  return found ?? start;
}

function labelsOf(checkout: string, files: readonly string[]): string[] {
  return files.map((file) => path.relative(checkout, file).split(path.sep).join('/'));
}

function readFile(tool: string, root: string): string[] {
  const { value, error } = attempt(() => RUNTIME_READERS[tool]?.(root));
  const errorFile = fieldOf(error, 'file');
  const file = value?.file ?? (typeof errorFile === 'string' ? errorFile : undefined);
  return file === undefined ? [] : [path.join(root, file)];
}

function candidatesOf(tool: string, root: string): readonly string[] {
  if (tool === 'ruff') {
    return ruffConfigFiles(root);
  }
  if (tool === BLACK) {
    return blackConfigFiles(root);
  }
  if (tool === PYRIGHT) {
    const files = PYRIGHT_CHECKERS.flatMap(
      (checker) => readProjectPyright(root, checker, { upward: true })?.files ?? [],
    );
    return [...new Set(files)];
  }
  return readFile(tool, root);
}

export function pythonConfigEntries(
  tool: string,
  root: string,
): { file: string; text: string; content: string }[] {
  const checkout = checkoutOf(root);
  return labelsOf(checkout, candidatesOf(tool, root)).flatMap((file) => {
    const content = readInside(checkout, file, 'utf8');
    const text = content === undefined ? undefined : pythonConfigText(tool, file, content);
    return content === undefined || text === undefined ? [] : [{ file, text, content }];
  });
}

import { isTable, parseToml, readProjectFile } from '../project-files.mts';
import { fieldOf, textsOf } from '../../../../../shared/values/readers.mts';
import type { IniSource, OptionValue, PytestConfig, RawOptions } from '../typed/config-types.mts';
import { parseIni } from './ini-file.mts';

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
const PYTEST = 'pytest';
const OWN_TOML = ['pytest.toml', '.pytest.toml'];
const INI_SOURCES: readonly IniSource[] = [
  { file: 'pytest.ini', section: PYTEST, always: true },
  { file: '.pytest.ini', section: PYTEST, always: true },
  { file: 'pyproject.toml', section: undefined, always: false },
  { file: 'tox.ini', section: PYTEST, always: false },
  { file: 'setup.cfg', section: 'tool:pytest', always: false },
];

function normalized(options: Readonly<Record<string, unknown>>): RawOptions {
  return Object.fromEntries(
    Object.entries(options).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map(String) : String(value),
    ]),
  );
}

function pyprojectOptions(text: string): RawOptions | undefined {
  const parsed = parseToml(text);
  const pytest = parsed.kind === 'table' ? fieldOf(parsed.table['tool'], PYTEST) : undefined;
  if (!isTable(pytest)) {
    return undefined;
  }
  const { ini_options: legacy, ...native } = pytest;
  return normalized({ ...(isTable(legacy) ? legacy : {}), ...native });
}

function tomlOptions(text: string): RawOptions {
  const parsed = parseToml(text);
  const table = parsed.kind === 'table' ? (parsed.table[PYTEST] ?? parsed.table) : {};
  return normalized(isTable(table) ? table : {});
}

function iniOptions(text: string, section: string): Record<string, string> | undefined {
  const options = parseIni(text).get(section);
  return options === undefined ? undefined : Object.fromEntries(options);
}

function sourceOptions(
  projectRoot: string,
  { file, section, always }: IniSource,
): RawOptions | undefined {
  const text = readProjectFile(projectRoot, file);
  if (text === undefined) {
    return undefined;
  }
  const found =
    file === 'pyproject.toml' ? pyprojectOptions(text) : iniOptions(text, section ?? PYTEST);
  return found ?? (always ? {} : undefined);
}

function configuredOptions(projectRoot: string): RawOptions {
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

function words(value: unknown): string[] {
  if (Array.isArray(value)) {
    return textsOf(value);
  }
  return typeof value === 'string' ? value.split(/\s+/u).filter((entry) => entry !== '') : [];
}

function listOr(value: unknown, fallback: string[]): string[] {
  const list = words(value);
  return list.length === 0 ? fallback : list;
}

const SHELL_WORD = /(?:[^\s"']|"[^"]*"?|'[^']*'?)+/gu;
const SHELL_QUOTED = /"([^"]*)"?|'([^']*)'?/gu;

export function shellWords(text: string): string[] {
  return [...text.matchAll(SHELL_WORD)].map(([word = '']) =>
    word.replaceAll(
      SHELL_QUOTED,
      (_quoted: string, double: string | undefined, single: string | undefined) =>
        double ?? single ?? '',
    ),
  );
}

const TRUE_WORDS = new Set(['1', 'true', 'yes', 'y', 'on', 't']);
const INLINE_COMMENT = /\s*[;#].*$/u;
const OVERRIDE_FLAGS = ['-o', '--override-ini'];

function isEnabled(value: OptionValue | undefined): boolean {
  const text = String(value ?? '')
    .replace(INLINE_COMMENT, '')
    .trim()
    .toLowerCase();
  return TRUE_WORDS.has(text);
}

function overrideSetting(word: string, following: string | undefined): string | undefined {
  if (OVERRIDE_FLAGS.includes(word)) {
    return following;
  }
  if (word.startsWith('--override-ini=')) {
    return word.slice('--override-ini='.length);
  }
  return /^-o[^-]/u.test(word) ? word.slice(2) : undefined;
}

function overriddenIni(words: readonly string[], key: string): string | undefined {
  const prefix = `${key}=`;
  const values = words
    .map((word, index) => overrideSetting(word, words[index + 1]))
    .flatMap((setting) => (setting?.startsWith(prefix) ? [setting.slice(prefix.length)] : []));
  return values.at(-1);
}

export function readPytestConfig(projectRoot: string): PytestConfig {
  const options = configuredOptions(projectRoot);
  const addopts = options['addopts'];
  const optionWords = Array.isArray(addopts) ? addopts : shellWords(addopts ?? '');
  return {
    pythonFiles: listOr(options['python_files'], DEFAULT_PYTHON_FILES),
    pythonClasses: listOr(options['python_classes'], DEFAULT_PYTHON_CLASSES),
    pythonFunctions: listOr(options['python_functions'], DEFAULT_PYTHON_FUNCTIONS),
    norecursedirs: listOr(options['norecursedirs'], DEFAULT_NORECURSEDIRS),
    testpaths: words(options['testpaths']),
    xfailStrict: isEnabled(overriddenIni(optionWords, 'xfail_strict') ?? options['xfail_strict']),
    ...(options['DJANGO_SETTINGS_MODULE'] === undefined
      ? {}
      : { djangoSettingsModule: options['DJANGO_SETTINGS_MODULE'] }),
    addopts: optionWords,
  };
}

export function readPythonFiles(projectRoot: string): string[] {
  return readPytestConfig(projectRoot).pythonFiles;
}

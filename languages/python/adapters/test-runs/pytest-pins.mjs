import { parseIni } from '../configuration/ini-parser.mjs';
import { readProjectFile, toml } from '../../libraries/project-files.mjs';

const CONFIG_FILES = [
  { file: 'pytest.toml', read: (text) => tomlTable(text, ['pytest']) },
  { file: '.pytest.toml', read: (text) => tomlTable(text, ['pytest']) },
  { file: 'pytest.ini', read: (text) => iniSection(text, 'pytest') ?? {} },
  { file: '.pytest.ini', read: (text) => iniSection(text, 'pytest') ?? {} },
  {
    file: 'pyproject.toml',
    read: (text) =>
      tomlTable(text, ['tool', 'pytest', 'ini_options']) ?? tomlTable(text, ['tool', 'pytest']),
  },
  { file: 'tox.ini', read: (text) => iniSection(text, 'pytest') },
  { file: 'setup.cfg', read: (text) => iniSection(text, 'tool:pytest') },
];
const STOPPING_FLAGS = new Set([
  '-x',
  '--exitfirst',
  '--sw',
  '--stepwise',
  '--sw-skip',
  '--stepwise-skip',
  '--co',
  '--collect-only',
  '--setup-only',
  '--setup-plan',
]);
const FILTERING_OPTIONS = new Set([
  '--maxfail',
  '-k',
  '--deselect',
  '--reruns',
  '--reruns-delay',
  '--only-rerun',
  '--rerun-except',
  '--retries',
  '--retry-delay',
]);
const RESULT_PLUGINS = new Set(['python', 'unittest', 'doctest', 'junitxml', 'runner', 'main']);
const PLUGIN_OFF = 'no:';
const SHORT_WITH_VALUE = new Set(['k', 'm', 'p', 'c', 'o', 'W', 'r', 'n']);

function tomlTable(text, keys) {
  const table = keys.reduce((current, key) => current?.[key], toml().parse(text));
  return table !== null && typeof table === 'object' && !Array.isArray(table) ? table : undefined;
}

function iniSection(text, name) {
  const section = parseIni(text).get(name);
  return section === undefined ? undefined : Object.fromEntries(section);
}

const SHELL_WORD = /(?:[^\s'"\\]+|\\[\s\S]?|"(?:[^"\\]|\\[\s\S])*(?:"|$)|'[^']*(?:'|$))+/gu;
const SHELL_PIECE = /"((?:[^"\\]|\\[\s\S])*)"?|'([^']*)'?|\\([\s\S]?)/gu;

function unquoted(...[, double, single, escaped]) {
  if (double !== undefined) {
    return double.replaceAll(/\\([\s\S])/gu, '$1');
  }
  return single ?? (escaped === '' ? '\\' : escaped);
}

/** Splits text into words the way a POSIX shell does, with quotes and backslash escapes. */
export function shellWords(text) {
  return [...text.matchAll(SHELL_WORD)].map(([word]) => word.replaceAll(SHELL_PIECE, unquoted));
}

function quoted(word) {
  return /^[\w@%+=:,./-]+$/u.test(word) ? word : `'${word.replaceAll("'", String.raw`'"'"'`)}'`;
}

export function readPytestAddopts(projectRoot) {
  for (const { file, read } of CONFIG_FILES) {
    const text = readProjectFile(projectRoot, file);
    const options = text === undefined ? undefined : read(text);
    if (options !== undefined) {
      const value = options.addopts ?? [];
      return { file, words: Array.isArray(value) ? value.map(String) : shellWords(String(value)) };
    }
  }
  return { file: undefined, words: [] };
}

function withoutExitFirst(word) {
  const flags = /^-([A-Za-z]{2,})$/u.exec(word)?.[1];
  if (flags === undefined || !flags.includes('x')) {
    return word;
  }
  const valueAt = Array.from(flags).findIndex((flag) => SHORT_WITH_VALUE.has(flag));
  const end = valueAt === -1 ? flags.length : valueAt;
  const kept = `${flags.slice(0, end).replaceAll('x', '')}${flags.slice(end)}`;
  return kept === '' ? undefined : `-${kept}`;
}

function optionName(word) {
  if (word.startsWith('--')) {
    return word.split('=')[0];
  }
  return /^-[kp]/u.test(word) ? word.slice(0, 2) : word;
}

function attachedValue(word, name) {
  if (word.length === name.length) {
    return undefined;
  }
  return word.startsWith('--') ? word.slice(name.length + 1) : word.slice(name.length);
}

function pinnedOption(name, value) {
  if (name === '-p') {
    return value.startsWith(PLUGIN_OFF) && RESULT_PLUGINS.has(value.slice(PLUGIN_OFF.length));
  }
  return FILTERING_OPTIONS.has(name);
}

function pinWord(word, following) {
  const name = optionName(word);
  const takesValue = FILTERING_OPTIONS.has(name) || name === '-p';
  const attached = takesValue ? attachedValue(word, name) : undefined;
  const value = attached ?? (takesValue ? following : undefined);
  if (value !== undefined && pinnedOption(name, value)) {
    return attached === undefined
      ? { removed: [`${word} ${value}`], kept: [], consumesNext: true }
      : { removed: [word], kept: [], consumesNext: false };
  }
  if (STOPPING_FLAGS.has(word)) {
    return { removed: [word], kept: [], consumesNext: false };
  }
  const flags = withoutExitFirst(word);
  return {
    removed: flags === word ? [] : [word],
    kept: flags === undefined ? [] : [flags],
    consumesNext: false,
  };
}

export function pinAddopts(words) {
  const kept = [];
  const removed = [];
  let skipped = false;
  for (const [index, word] of words.entries()) {
    const outcome = skipped
      ? { removed: [], kept: [], consumesNext: false }
      : pinWord(word, words[index + 1]);
    removed.push(...outcome.removed);
    kept.push(...outcome.kept);
    skipped = outcome.consumesNext;
  }
  return { kept, removed };
}

export function pinnedPytestArguments(projectRoot, { rerunfailures = false } = {}) {
  const { words } = readPytestAddopts(projectRoot);
  const { kept, removed } = pinAddopts(words);
  return [
    ...(removed.length === 0 ? [] : ['-o', `addopts=${kept.map(quoted).join(' ')}`]),
    ...(rerunfailures ? ['-o', 'reruns=0'] : []),
  ];
}

export function pinnedEnvironmentAddopts(value) {
  if (value === undefined || value === '') {
    return {};
  }
  const { kept, removed } = pinAddopts(shellWords(value));
  return removed.length === 0 ? {} : { PYTEST_ADDOPTS: kept.map(quoted).join(' ') };
}

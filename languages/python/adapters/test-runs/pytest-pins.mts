import { parseIni } from '../configuration/ini-parser.mts';
import { readProjectFile, toml } from '../../libraries/project-files.mts';
import { fieldOf, isPlainObject, textOf } from '../../../../shared/values/readers.mts';
import { appendAll } from '../../../../shared/lists/lists.mts';

type Options = Readonly<Record<string, unknown>>;
type PinOutcome = {
  readonly removed: string[];
  readonly kept: string[];
  readonly consumesNext: boolean;
};

const PYTEST = 'pytest';
const CONFIG_FILES: readonly {
  readonly file: string;
  readonly read: (text: string) => Options | undefined;
}[] = [
  { file: 'pytest.toml', read: (text: string) => tomlTable(text, [PYTEST]) },
  { file: '.pytest.toml', read: (text: string) => tomlTable(text, [PYTEST]) },
  { file: 'pytest.ini', read: (text) => iniSection(text, PYTEST) ?? {} },
  { file: '.pytest.ini', read: (text) => iniSection(text, PYTEST) ?? {} },
  {
    file: 'pyproject.toml',
    read: (text) =>
      tomlTable(text, ['tool', PYTEST, 'ini_options']) ?? tomlTable(text, ['tool', PYTEST]),
  },
  { file: 'tox.ini', read: (text) => iniSection(text, PYTEST) },
  { file: 'setup.cfg', read: (text) => iniSection(text, 'tool:pytest') },
];
const RETRY_PLUGINS = [
  { plugin: 'rerunfailures', count: 'reruns', delay: 'reruns_delay' },
  { plugin: 'retry', count: 'retries', delay: 'retry_delay' },
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
  '-m',
  '--deselect',
  '--reruns',
  '--reruns-delay',
  '--only-rerun',
  '--rerun-except',
  '--retries',
  '--retry-delay',
  '--max-runs',
  '--min-passes',
]);
const RETRY_FLAGS = new Set(['--force-flaky']);
const RESULT_PLUGINS = new Set(['python', 'unittest', 'doctest', 'junitxml', 'runner', 'main']);
const PLUGIN_OFF = 'no:';
const SHORT_WITH_VALUE = new Set(['k', 'm', 'p', 'c', 'o', 'W', 'r', 'n']);

function tomlTable(text: string, keys: readonly string[]): Options | undefined {
  const table = keys.reduce((current: unknown, key) => fieldOf(current, key), toml().parse(text));
  return isPlainObject(table) ? table : undefined;
}

function iniSection(text: string, name: string): Options | undefined {
  const section = parseIni(text).get(name);
  return section === undefined ? undefined : Object.fromEntries(section);
}

const SHELL_WORD = /(?:[^\s'"\\]|\\[\s\S]?|"(?:[^"\\]|\\[\s\S])*(?:"|$)|'[^']*(?:'|$))+/gu;
const SHELL_PIECE = /"((?:[^"\\]|\\[\s\S])*)"?|'([^']*)'?|\\([\s\S]?)/gu;

function unquoted(...[, double, single, escaped]: (string | undefined)[]): string {
  if (double !== undefined) {
    return double.replaceAll(/\\([\s\S])/gu, '$1');
  }
  return single ?? (escaped === undefined || escaped === '' ? '\\' : escaped);
}

export function shellWords(text: string): string[] {
  return [...text.matchAll(SHELL_WORD)].map(([word = '']) =>
    word.replaceAll(SHELL_PIECE, unquoted),
  );
}

function quoted(word: string): string {
  return /^[\w@%+=:,./-]+$/u.test(word) ? word : `'${word.replaceAll("'", String.raw`'"'"'`)}'`;
}

export function readPytestOptions(projectRoot: string): {
  file: string | undefined;
  options: Options;
} {
  for (const { file, read } of CONFIG_FILES) {
    const text = readProjectFile(projectRoot, file);
    const options = text === undefined ? undefined : read(text);
    if (options !== undefined) {
      return { file, options };
    }
  }
  return { file: undefined, options: {} };
}

export function readPytestAddopts(projectRoot: string): {
  file: string | undefined;
  words: string[];
} {
  const { file, options } = readPytestOptions(projectRoot);
  const value = options['addopts'] ?? [];
  return { file, words: Array.isArray(value) ? value.map(textOf) : shellWords(textOf(value)) };
}

function withoutExitFirst(word: string): string | undefined {
  const flags = /^-([A-Za-z]{2,})$/u.exec(word)?.[1];
  if (flags === undefined || !flags.includes('x')) {
    return word;
  }
  const valueAt = Array.from(flags).findIndex((flag) => SHORT_WITH_VALUE.has(flag));
  const end = valueAt === -1 ? flags.length : valueAt;
  const kept = `${flags.slice(0, end).replaceAll('x', '')}${flags.slice(end)}`;
  return kept === '' ? undefined : `-${kept}`;
}

function optionName(word: string): string {
  if (word.startsWith('--')) {
    return word.split('=')[0] ?? '';
  }
  return /^-[kmp]/u.test(word) ? word.slice(0, 2) : word;
}

function attachedValue(word: string, name: string): string | undefined {
  if (word.length === name.length) {
    return undefined;
  }
  return word.startsWith('--') ? word.slice(name.length + 1) : word.slice(name.length);
}

function pinnedOption(name: string, value: string): boolean {
  if (name === '-p') {
    return value.startsWith(PLUGIN_OFF) && RESULT_PLUGINS.has(value.slice(PLUGIN_OFF.length));
  }
  return FILTERING_OPTIONS.has(name);
}

function retryArguments(probe: Options, retries: Options): string[] {
  return RETRY_PLUGINS.filter(({ plugin }) => probe[plugin] === true).flatMap(
    ({ count, delay }) => [
      '-o',
      `${count}=${textOf(retries[count] ?? 0)}`,
      ...(retries[delay] === undefined ? [] : ['-o', `${delay}=${textOf(retries[delay])}`]),
    ],
  );
}

function pinWord(word: string, following: string | undefined): PinOutcome {
  const name = optionName(word);
  const takesValue = FILTERING_OPTIONS.has(name) || name === '-p';
  const attached = takesValue ? attachedValue(word, name) : undefined;
  const value = attached ?? (takesValue ? following : undefined);
  if (value !== undefined && pinnedOption(name, value)) {
    return attached === undefined
      ? { removed: [`${word} ${value}`], kept: [], consumesNext: true }
      : { removed: [word], kept: [], consumesNext: false };
  }
  if (STOPPING_FLAGS.has(word) || RETRY_FLAGS.has(word)) {
    return { removed: [word], kept: [], consumesNext: false };
  }
  const flags = withoutExitFirst(word);
  return {
    removed: flags === word ? [] : [word],
    kept: flags === undefined ? [] : [flags],
    consumesNext: false,
  };
}

export function pinAddopts(words: readonly string[]): { kept: string[]; removed: string[] } {
  const kept: string[] = [];
  const removed: string[] = [];
  let skipped = false;
  for (const [index, word] of words.entries()) {
    const outcome: PinOutcome = skipped
      ? { removed: [], kept: [], consumesNext: false }
      : pinWord(word, words[index + 1]);
    appendAll(removed, outcome.removed);
    appendAll(kept, outcome.kept);
    skipped = outcome.consumesNext;
  }
  return { kept, removed };
}

export function pinnedPytestArguments(
  projectRoot: string,
  probe: Options = {},
  retries: Options = {},
): string[] {
  const { words } = readPytestAddopts(projectRoot);
  const { kept, removed } = pinAddopts(words);
  return [
    ...(removed.length === 0 ? [] : ['-o', `addopts=${kept.map(quoted).join(' ')}`]),
    ...retryArguments(probe, retries),
  ];
}

export function pinnedEnvironmentAddopts(value: string | undefined): Record<string, string> {
  if (value === undefined || value === '') {
    return {};
  }
  const { kept, removed } = pinAddopts(shellWords(value));
  return removed.length === 0 ? {} : { PYTEST_ADDOPTS: kept.map(quoted).join(' ') };
}

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseIni } from '../configuration/mypy-config.mjs';
import { toml } from '../../libraries/project-files.mjs';

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
const SHORT_WITH_VALUE = new Set(['k', 'm', 'p', 'c', 'o', 'W', 'r', 'n']);

function tomlTable(text, keys) {
  const table = keys.reduce((current, key) => current?.[key], toml().parse(text));
  return table !== null && typeof table === 'object' && !Array.isArray(table) ? table : undefined;
}

function iniSection(text, name) {
  const section = parseIni(text).get(name);
  return section === undefined ? undefined : Object.fromEntries(section);
}

export function shellWords(text) {
  const words = [];
  let current;
  let quote;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote === undefined && /\s/u.test(character)) {
      if (current !== undefined) {
        words.push(current);
      }
      current = undefined;
    } else if (quote === undefined && (character === '"' || character === "'")) {
      quote = character;
      current ??= '';
    } else if (character === quote) {
      quote = undefined;
    } else if (character === '\\' && quote !== "'" && index + 1 < text.length) {
      index += 1;
      current = `${current ?? ''}${text[index]}`;
    } else {
      current = `${current ?? ''}${character}`;
    }
  }
  return current === undefined ? words : [...words, current];
}

function quoted(word) {
  return /^[\w@%+=:,./-]+$/u.test(word) ? word : `'${word.replaceAll("'", String.raw`'"'"'`)}'`;
}

export function readPytestAddopts(projectRoot) {
  for (const { file, read } of CONFIG_FILES) {
    const absolute = path.join(projectRoot, file);
    const options = existsSync(absolute) ? read(readFileSync(absolute, 'utf8')) : undefined;
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
  const valueAt = [...flags].findIndex((flag) => SHORT_WITH_VALUE.has(flag));
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
    return value.startsWith('no:') && RESULT_PLUGINS.has(value.slice(3));
  }
  return FILTERING_OPTIONS.has(name);
}

export function pinAddopts(words) {
  const kept = [];
  const removed = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const name = optionName(word);
    const takesValue = FILTERING_OPTIONS.has(name) || name === '-p';
    const attached = takesValue ? attachedValue(word, name) : undefined;
    const value = attached ?? (takesValue ? words[index + 1] : undefined);
    if (takesValue && value !== undefined && pinnedOption(name, value)) {
      removed.push(attached === undefined ? `${word} ${value}` : word);
      index += attached === undefined ? 1 : 0;
    } else if (STOPPING_FLAGS.has(word)) {
      removed.push(word);
    } else {
      const flags = withoutExitFirst(word);
      if (flags !== word) {
        removed.push(word);
      }
      if (flags !== undefined) {
        kept.push(flags);
      }
    }
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

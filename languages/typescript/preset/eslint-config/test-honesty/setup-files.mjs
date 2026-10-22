import { readFileSync } from 'node:fs';
import path from 'node:path';
import { firstFileIn } from '../../../../../shared/filesystem.mjs';

const CODE_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];

export const VITEST_CONFIG_NAMES = ['vitest', 'vite'].flatMap((name) =>
  CODE_EXTENSIONS.map((extension) => `${name}.config.${extension}`),
);
const JEST_CONFIG_NAMES = [...CODE_EXTENSIONS, 'json'].map(
  (extension) => `jest.config.${extension}`,
);
const MOCHA_CONFIG_NAMES = ['js', 'cjs', 'mjs', 'json', 'jsonc', 'yaml', 'yml'].map(
  (extension) => `.mocharc.${extension}`,
);
const SETUP_KEYS = {
  vitest: ['setupFiles', 'globalSetup'],
  jest: ['setupFiles', 'setupFilesAfterEnv', 'globalSetup', 'globalTeardown'],
  mocha: ['require', 'file'],
};
const CONFIG_NAMES = {
  vitest: VITEST_CONFIG_NAMES,
  jest: JEST_CONFIG_NAMES,
  mocha: MOCHA_CONFIG_NAMES,
};
const MANIFEST_KEYS = { jest: 'jest', mocha: 'mocha' };
const QUOTED = /(['"`])([^'"`]+)\1/gu;
const CODE_FILE = /\.[cm]?[jt]sx?$/u;
const NODE_PRELOAD = /(?:^|\s)(?:--import|--require|-r)(?:=|\s+)(['"]?)([^\s'"]+)\1/gu;
const ROOT_DIR = /^<rootDir>\//u;

function optionPattern(keys) {
  const value = String.raw`(\[[^\]]*\]|(['"\x60])[^'"\x60\n]+\2|[^\s,'"\x60\[\]{}#]+(?:\s*\n(?:\s*-\s*[^\n]+\n?)+)?|\s*\n(?:\s*-\s*[^\n]+\n?)+)`;
  return new RegExp(String.raw`["']?\b(?:${keys.join('|')})["']?[ \t]*:[ \t]*${value}`, 'gu');
}

function entriesOf(value) {
  const quoted = [...value.matchAll(QUOTED)].map((match) => match[2]);
  if (quoted.length > 0) {
    return quoted;
  }
  return value
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/u, '').trim())
    .filter((line) => line !== '');
}

function optionEntries(text, keys) {
  return [...text.matchAll(optionPattern(keys))].flatMap(([, value]) => entriesOf(value));
}

function manifest(projectRoot) {
  try {
    return JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) {
      return {};
    }
    throw error;
  }
}

function configEntries(projectRoot, runner) {
  const keys = SETUP_KEYS[runner];
  const configPath = firstFileIn(projectRoot, CONFIG_NAMES[runner]);
  const fromConfig =
    configPath === undefined ? [] : optionEntries(readFileSync(configPath, 'utf8'), keys);
  const manifestOptions = manifest(projectRoot)[MANIFEST_KEYS[runner]];
  const fromManifest =
    manifestOptions === undefined ? [] : optionEntries(JSON.stringify(manifestOptions), keys);
  return [...fromConfig, ...fromManifest];
}

function scriptEntries(projectRoot) {
  const script = manifest(projectRoot).scripts?.test ?? '';
  return [...script.matchAll(NODE_PRELOAD)].map((match) => match[2]);
}

function runnerEntries(projectRoot, runner) {
  if (runner === 'node') {
    return scriptEntries(projectRoot);
  }
  const entries = configEntries(projectRoot, runner);
  return runner === 'mocha' ? [...entries, ...scriptEntries(projectRoot)] : entries;
}

export function setupFilesIn(projectRoot, runner = 'vitest') {
  return [
    ...new Set(
      runnerEntries(projectRoot, runner)
        .map((entry) => entry.replace(ROOT_DIR, ''))
        .filter((entry) => CODE_FILE.test(entry) && !entry.startsWith('@'))
        .map((entry) => path.posix.normalize(entry.replaceAll('\\', '/'))),
    ),
  ];
}

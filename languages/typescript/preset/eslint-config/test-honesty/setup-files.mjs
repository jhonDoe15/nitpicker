import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { firstFileIn, isDirectory, isFile } from '../../../../../shared/filesystem.mjs';
import { manifestScripts, testScriptCommands } from '../../test-runner/detection/test-scripts.mjs';
import { optionEntries, rootDirIn, scriptPreloads, withoutComments } from './setup-option-text.mjs';

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
const CODE_FILE = /\.[cm]?[jt]sx?$/u;
const ROOT_DIR = /^<rootDir>\//u;
const PROJECT_GLOB = /\/\*$/u;
const PROJECT_RUNNERS = new Set(['jest', 'vitest']);

function directoryNames(directory) {
  if (!isDirectory(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
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

function configTexts(projectRoot, runner) {
  const configPath = firstFileIn(projectRoot, CONFIG_NAMES[runner]);
  const fromConfig =
    configPath === undefined ? [] : [withoutComments(readFileSync(configPath, 'utf8'), configPath)];
  const manifestOptions = manifest(projectRoot)[MANIFEST_KEYS[runner]];
  return manifestOptions === undefined
    ? fromConfig
    : [...fromConfig, JSON.stringify(manifestOptions)];
}

function fromRootDir(entry, rootDir) {
  return rootDir === undefined
    ? entry.replace(ROOT_DIR, '')
    : entry.replace(ROOT_DIR, `${rootDir}/`);
}

function configEntries(projectRoot, runner) {
  return configTexts(projectRoot, runner).flatMap((text) =>
    optionEntries(text, SETUP_KEYS[runner]).map((entry) => fromRootDir(entry, rootDirIn(text))),
  );
}

function scriptEntries(projectRoot) {
  return testScriptCommands(manifestScripts(manifest(projectRoot))).flatMap(scriptPreloads);
}

function projectDirectories(projectRoot, entry) {
  const pattern = entry.replace(ROOT_DIR, '');
  const parent = PROJECT_GLOB.test(pattern) ? pattern.replace(PROJECT_GLOB, '') : undefined;
  const candidates =
    parent === undefined
      ? [pattern]
      : directoryNames(path.join(projectRoot, parent)).map((name) => `${parent}/${name}`);
  return candidates.filter((candidate) => isDirectory(path.join(projectRoot, candidate)));
}

function projectDirectoriesOf(projectRoot, runner) {
  return configTexts(projectRoot, runner)
    .flatMap((text) => optionEntries(text, ['projects']))
    .flatMap((entry) => projectDirectories(projectRoot, entry));
}

function ownEntries(projectRoot, runner) {
  if (runner === 'node') {
    return scriptEntries(projectRoot);
  }
  const entries = configEntries(projectRoot, runner);
  return runner === 'mocha' ? [...entries, ...scriptEntries(projectRoot)] : entries;
}

function runnerEntries(projectRoot, runner) {
  const pending = ['.'];
  const entries = [];
  for (const directory of pending) {
    const root = path.join(projectRoot, directory);
    entries.push(...ownEntries(root, runner).map((file) => path.posix.join(directory, file)));
    const projects = PROJECT_RUNNERS.has(runner) ? projectDirectoriesOf(root, runner) : [];
    const added = projects
      .map((project) => path.posix.join(directory, project))
      .filter((project) => !pending.includes(project));
    pending.push(...new Set(added));
  }
  return entries;
}

function codeFileOf(projectRoot, entry) {
  if (CODE_FILE.test(entry)) {
    return entry;
  }
  const candidates = CODE_EXTENSIONS.flatMap((extension) => [
    `${entry}.${extension}`,
    `${entry}/index.${extension}`,
  ]);
  return candidates.find((candidate) => isFile(path.join(projectRoot, candidate)));
}

export function setupFilesIn(projectRoot, runner = 'vitest') {
  const files = runnerEntries(projectRoot, runner)
    .filter((entry) => !entry.startsWith('@'))
    .map((entry) => path.posix.normalize(entry.replaceAll('\\', '/')))
    .map((entry) => codeFileOf(projectRoot, entry))
    .filter((entry) => entry !== undefined);
  return [...new Set(files)];
}

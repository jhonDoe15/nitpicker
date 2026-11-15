import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  firstFileIn as untypedFirstFileIn,
  isDirectory as untypedIsDirectory,
  isFile as untypedIsFile,
} from '../../../../../shared/filesystem.mjs';
import {
  manifestScripts as untypedManifestScripts,
  testScriptCommands as untypedTestScriptCommands,
} from '../../test-runner/detection/test-scripts.mjs';
import {
  optionEntries as untypedOptionEntries,
  rootDirIn as untypedRootDirIn,
  scriptPreloads as untypedScriptPreloads,
  withoutComments as untypedWithoutComments,
} from './setup-option-text.mjs';
import { fieldOf, parseJson } from '../../../../../shared/values/readers.mts';

const firstFileIn: (root: string, names: readonly string[]) => string | undefined =
  untypedFirstFileIn;
const isDirectory: (directory: string) => boolean = untypedIsDirectory;
const isFile: (file: string) => boolean = untypedIsFile;
const manifestScripts: (manifest: unknown) => unknown = untypedManifestScripts;
const testScriptCommands: (scripts: unknown) => string[] = untypedTestScriptCommands;
const optionEntries: (text: string, keys: readonly string[]) => string[] = untypedOptionEntries;
const rootDirIn: (text: string) => string | undefined = untypedRootDirIn;
const scriptPreloads: (command: string) => string[] = untypedScriptPreloads;
const withoutComments: (text: string, file: string) => string = untypedWithoutComments;

const VITEST = 'vitest';

const CODE_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];

export const VITEST_CONFIG_NAMES = [VITEST, 'vite'].flatMap((name) =>
  CODE_EXTENSIONS.map((extension) => `${name}.config.${extension}`),
);
const JEST_CONFIG_NAMES = [...CODE_EXTENSIONS, 'json'].map(
  (extension) => `jest.config.${extension}`,
);
const MOCHA_CONFIG_NAMES = ['js', 'cjs', 'mjs', 'json', 'jsonc', 'yaml', 'yml'].map(
  (extension) => `.mocharc.${extension}`,
);
const SETUP_KEYS: Readonly<Record<string, readonly string[]>> = {
  vitest: ['setupFiles', 'globalSetup'],
  jest: ['setupFiles', 'setupFilesAfterEnv', 'globalSetup', 'globalTeardown'],
  mocha: ['require', 'file'],
};
const CONFIG_NAMES: Readonly<Record<string, readonly string[]>> = {
  vitest: VITEST_CONFIG_NAMES,
  jest: JEST_CONFIG_NAMES,
  mocha: MOCHA_CONFIG_NAMES,
};
const MANIFEST_KEYS: Readonly<Record<string, string>> = { jest: 'jest', mocha: 'mocha' };
const CODE_FILE = /\.[cm]?[jt]sx?$/u;
const ROOT_DIR = /^<rootDir>\//u;
const PROJECT_GLOB = /\/\*$/u;
const PROJECT_RUNNERS = new Set(['jest', VITEST]);

function directoryNames(directory: string): string[] {
  if (!isDirectory(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function manifest(projectRoot: string): unknown {
  try {
    return parseJson(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  } catch (error) {
    if (fieldOf(error, 'code') === 'ENOENT' || error instanceof SyntaxError) {
      return {};
    }
    throw error;
  }
}

function configTexts(projectRoot: string, runner: string): string[] {
  const configPath = firstFileIn(projectRoot, CONFIG_NAMES[runner] ?? []);
  const fromConfig =
    configPath === undefined ? [] : [withoutComments(readFileSync(configPath, 'utf8'), configPath)];
  const manifestKey = MANIFEST_KEYS[runner];
  const manifestOptions: unknown =
    manifestKey === undefined ? undefined : fieldOf(manifest(projectRoot), manifestKey);
  return manifestOptions === undefined
    ? fromConfig
    : [...fromConfig, JSON.stringify(manifestOptions)];
}

function fromRootDir(entry: string, rootDir: string | undefined): string {
  return rootDir === undefined
    ? entry.replace(ROOT_DIR, '')
    : entry.replace(ROOT_DIR, `${rootDir}/`);
}

function configEntries(projectRoot: string, runner: string): string[] {
  return configTexts(projectRoot, runner).flatMap((text) =>
    optionEntries(text, SETUP_KEYS[runner] ?? []).map((entry) =>
      fromRootDir(entry, rootDirIn(text)),
    ),
  );
}

function scriptEntries(projectRoot: string): string[] {
  return testScriptCommands(manifestScripts(manifest(projectRoot))).flatMap(scriptPreloads);
}

function projectDirectories(projectRoot: string, entry: string): string[] {
  const pattern = entry.replace(ROOT_DIR, '');
  const parent = PROJECT_GLOB.test(pattern) ? pattern.replace(PROJECT_GLOB, '') : undefined;
  const candidates =
    parent === undefined
      ? [pattern]
      : directoryNames(path.join(projectRoot, parent)).map((name) => `${parent}/${name}`);
  return candidates.filter((candidate) => isDirectory(path.join(projectRoot, candidate)));
}

function projectDirectoriesOf(projectRoot: string, runner: string): string[] {
  return configTexts(projectRoot, runner)
    .flatMap((text) => optionEntries(text, ['projects']))
    .flatMap((entry) => projectDirectories(projectRoot, entry));
}

function ownEntries(projectRoot: string, runner: string): string[] {
  if (runner === 'node') {
    return scriptEntries(projectRoot);
  }
  const entries = configEntries(projectRoot, runner);
  return runner === 'mocha' ? [...entries, ...scriptEntries(projectRoot)] : entries;
}

function runnerEntries(projectRoot: string, runner: string): string[] {
  const pending = new Set(['.']);
  const entries: string[] = [];
  for (const directory of pending) {
    const root = path.join(projectRoot, directory);
    entries.push(...ownEntries(root, runner).map((file) => path.posix.join(directory, file)));
    const projects = PROJECT_RUNNERS.has(runner) ? projectDirectoriesOf(root, runner) : [];
    for (const project of projects) {
      pending.add(path.posix.join(directory, project));
    }
  }
  return entries;
}

function codeFileOf(projectRoot: string, entry: string): string | undefined {
  if (CODE_FILE.test(entry)) {
    return entry;
  }
  const candidates = CODE_EXTENSIONS.flatMap((extension) => [
    `${entry}.${extension}`,
    `${entry}/index.${extension}`,
  ]);
  return candidates.find((candidate) => isFile(path.join(projectRoot, candidate)));
}

export function setupFilesIn(projectRoot: string, runner: string = VITEST): string[] {
  const files = runnerEntries(projectRoot, runner)
    .filter((entry) => !entry.startsWith('@'))
    .map((entry) => path.posix.normalize(entry.replaceAll('\\', '/')))
    .map((entry) => codeFileOf(projectRoot, entry))
    .filter((entry) => entry !== undefined);
  return [...new Set(files)];
}

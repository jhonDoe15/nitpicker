import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, fieldsOf, listOf } from '../../../../../shared/values/readers.mts';
import type { TestFileFacts, TestFileRequest } from '../typed/command-types.mts';
import type { LayoutTestFiles } from '../../layout/layout-types.mts';
import { hasDomEnvironment } from '../../test-environment/environments.mts';
import { globalDomEnvironments } from '../../test-environment/global-dom/global-dom.mts';
import { readMochaOptions } from '../../test-environment/vite/vite-reader.mts';
import { projectFile } from './mocha-options.mts';
import {
  MOCHA_DEFAULT_EXTENSIONS,
  MOCHA_DEFAULT_SPEC,
  defaultTestFiles,
  normalizedGlob,
  testFilePatterns,
} from './test-file-patterns.mts';

type FolderShape = { readonly extensions: readonly string[]; readonly recursive: boolean };

const GLOB_MAGIC = /[!()*?[\]{}]/u;
const TIMEOUT_MS = 30_000;

function extensionGlob(extensions: readonly string[]): string {
  const names = extensions.map((extension) => extension.replace(/^\./u, ''));
  return names.length === 1 ? (names[0] ?? '') : `{${names.join(',')}}`;
}

function folderGlob(folder: string, { extensions, recursive }: FolderShape): string {
  return `${folder}/${recursive ? '**/' : ''}*.${extensionGlob(extensions)}`;
}

function specGlob(projectRoot: string, entry: string, shape: FolderShape): string {
  const file = projectFile(projectRoot, entry);
  if (GLOB_MAGIC.test(entry) || file === undefined) {
    return normalizedGlob(entry);
  }
  const relative = path.relative(projectRoot, file).split(path.sep).join('/');
  if (!existsSync(file)) {
    return `${relative}.${extensionGlob(shape.extensions)}`;
  }
  return statSync(file).isDirectory() ? folderGlob(relative, shape) : relative;
}

function stringList(value: unknown): string[] {
  return listOf(value).map(String);
}

function loadedOptions(options: {
  readonly projectRoot: string;
  readonly liveProjectRoot?: string | undefined;
  readonly tokens: readonly string[];
}): { loaded: unknown; failure: string | undefined } {
  const { result, failure } = readMochaOptions({ timeoutMs: TIMEOUT_MS, ...options });
  return { loaded: result, failure };
}

function mochaFailure(failure: string): string {
  return `The Mocha options could not be read (${failure}), so nitpicker takes Mocha's default spec (test/*.{js,cjs,mjs}) as the project's test files.`;
}

export function mochaSetupEntries(loaded: unknown): string[] {
  return [...stringList(fieldOf(loaded, 'require')), ...stringList(fieldOf(loaded, 'file'))];
}

function mochaTestFilesFrom(projectRoot: string, options: unknown): LayoutTestFiles {
  const loaded = fieldsOf(options);
  const spec = stringList(loaded['_']);
  const extensions = stringList(loaded['extension']);
  const shape: FolderShape = {
    extensions: extensions.length === 0 ? MOCHA_DEFAULT_EXTENSIONS : extensions,
    recursive: loaded['recursive'] === true,
  };
  const include =
    spec.length === 0
      ? [folderGlob(MOCHA_DEFAULT_SPEC, shape)]
      : spec.map((entry) => specGlob(projectRoot, entry, shape));
  return testFilePatterns({ include, exclude: stringList(loaded['ignore']) });
}

export function mochaTestFiles({
  projectRoot,
  liveProjectRoot,
  command,
}: TestFileRequest): TestFileFacts {
  const { loaded, failure } = loadedOptions({
    projectRoot,
    liveProjectRoot,
    tokens: command.arguments_,
  });
  if (failure !== undefined) {
    return {
      testFiles: defaultTestFiles('mocha'),
      domEnvironment: false,
      notices: [mochaFailure(failure)],
    };
  }
  return {
    testFiles:
      loaded === undefined ? defaultTestFiles('mocha') : mochaTestFilesFrom(projectRoot, loaded),
    domEnvironment: hasDomEnvironment(
      globalDomEnvironments(projectRoot, mochaSetupEntries(loaded)),
    ),
  };
}

export function loadedProjectMocha(options: {
  readonly projectRoot: string;
  readonly liveProjectRoot?: string | undefined;
  readonly tokens: readonly string[];
}): unknown {
  return loadedOptions(options).loaded;
}

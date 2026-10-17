import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { hasDomEnvironment } from '../../test-environment/environments.mjs';
import { globalDomEnvironments } from '../../test-environment/global-dom/global-dom.mjs';
import { readMochaOptions } from '../../test-environment/vite/vite-reader.mjs';
import {
  MOCHA_DEFAULT_EXTENSIONS,
  MOCHA_DEFAULT_SPEC,
  defaultTestFiles,
  normalizedGlob,
  testFilePatterns,
} from './test-file-patterns.mjs';

const GLOB_MAGIC = /[!()*?[\]{}]/u;
const TIMEOUT_MS = 30_000;

function projectPath(projectRoot, entry) {
  const file = path.resolve(projectRoot, entry);
  return file.startsWith(`${projectRoot}${path.sep}`) ? file : undefined;
}

function extensionGlob(extensions) {
  const names = extensions.map((extension) => String(extension).replace(/^\./u, ''));
  return names.length === 1 ? names[0] : `{${names.join(',')}}`;
}

function folderGlob(folder, { extensions, recursive }) {
  return `${folder}/${recursive ? '**/' : ''}*.${extensionGlob(extensions)}`;
}

function specGlob(projectRoot, entry, shape) {
  const file = projectPath(projectRoot, entry);
  if (GLOB_MAGIC.test(entry) || file === undefined) {
    return normalizedGlob(entry);
  }
  const relative = path.relative(projectRoot, file).split(path.sep).join('/');
  if (!existsSync(file)) {
    return `${relative}.${extensionGlob(shape.extensions)}`;
  }
  return statSync(file).isDirectory() ? folderGlob(relative, shape) : relative;
}

function stringList(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function loadedOptions(options) {
  const { result, failure } = readMochaOptions({ timeoutMs: TIMEOUT_MS, ...options });
  return { loaded: result, failure };
}

function mochaFailure(failure) {
  return `The Mocha options could not be read (${failure}), so nitpicker takes Mocha's default spec (test/*.{js,cjs,mjs}) as the project's test files.`;
}

export function mochaSetupEntries(loaded) {
  return [...stringList(loaded?.require), ...stringList(loaded?.file)];
}

function mochaTestFilesFrom(projectRoot, loaded) {
  const spec = stringList(loaded._);
  const extensions = stringList(loaded.extension);
  const shape = {
    extensions: extensions.length === 0 ? MOCHA_DEFAULT_EXTENSIONS : extensions,
    recursive: loaded.recursive === true,
  };
  const include =
    spec.length === 0
      ? [folderGlob(MOCHA_DEFAULT_SPEC, shape)]
      : spec.map((entry) => specGlob(projectRoot, entry, shape));
  return testFilePatterns({ include, exclude: stringList(loaded.ignore) });
}

export function mochaTestFiles({ projectRoot, liveProjectRoot, command }) {
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

export function loadedProjectMocha(options) {
  return loadedOptions(options).loaded;
}

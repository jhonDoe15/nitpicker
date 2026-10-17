import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadedMochaOptions } from './mocha-options.mjs';
import {
  MOCHA_DEFAULT_EXTENSIONS,
  MOCHA_DEFAULT_SPEC,
  defaultTestFiles,
  normalizedGlob,
  testFilePatterns,
} from './test-file-patterns.mjs';

const GLOB_MAGIC = /[!()*?[\]{}]/u;

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
  try {
    return { loaded: loadedMochaOptions(options) };
  } catch (error) {
    return { failure: error instanceof Error ? error.message : String(error) };
  }
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

export function mochaTestFiles({ projectRoot, command }) {
  const { loaded } = loadedOptions({ projectRoot, tokens: command.arguments_ });
  return loaded === undefined ? defaultTestFiles('mocha') : mochaTestFilesFrom(projectRoot, loaded);
}

export function loadedProjectMocha(options) {
  return loadedOptions(options).loaded;
}

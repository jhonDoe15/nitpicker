import path from 'node:path';
import { readStamped } from '../../modules/stamped-file-cache.mjs';
import {
  isSourceFile as defaultIsSourceFile,
  isTestFile as defaultIsTestFile,
} from '../../layout.mjs';
import {
  configFileNames,
  includedFileNames,
  isSolutionTsconfig,
  parsedTsconfig,
  readJsonc,
  referencedTsconfigs,
} from '../../modules/tsconfig-files.mjs';

const LIB_FILE = /^lib\.(.+)\.d\.ts$/u;
const BUILD_ONLY_OPTIONS = ['composite', 'tsBuildInfoFile'];
const resolutions = new Map();
const UNSET = JSON.parse('null');

function solutionReferences(file) {
  const config = readJsonc(file);
  return isSolutionTsconfig(config) ? referencedTsconfigs(file, config) : undefined;
}

function leafConfigs(root) {
  const queue = new Set([root]);
  const leaves = [];
  for (const file of queue) {
    const references = solutionReferences(file);
    if (references === undefined) {
      leaves.push(file);
      continue;
    }
    for (const next of references) {
      queue.add(next);
    }
  }
  return leaves;
}

function relativeTo(directory, file) {
  return path.relative(directory, file).split(path.sep).join('/');
}

function coverage(file, directory, layout) {
  const isTest = typeof layout.isTestFile === 'function' ? layout.isTestFile : defaultIsTestFile;
  const isSource =
    typeof layout.isSourceFile === 'function' ? layout.isSourceFile : defaultIsSourceFile;
  const names = configFileNames(file).map((name) => relativeTo(directory, name));
  const tests = names.filter((name) => isTest(name)).length;
  return { file, tests, covered: tests + names.filter((name) => isSource(name)).length };
}

function best(candidates) {
  return candidates.reduce((chosen, next) =>
    next.covered > chosen.covered || (next.covered === chosen.covered && next.tests > chosen.tests)
      ? next
      : chosen,
  );
}

function union(lists) {
  return lists.every(Array.isArray) ? [...new Set(lists.flat())] : undefined;
}

function escapesRootDir(rootDir, directory, layout) {
  return (
    rootDir !== undefined &&
    typeof layout.projectCodeFiles === 'function' &&
    layout
      .projectCodeFiles(directory)
      .some((file) => isOutside(rootDir, path.resolve(directory, file)))
  );
}

function isOutside(rootDir, file) {
  const relative = path.relative(rootDir, file);
  return relative.startsWith('..') || path.isAbsolute(relative);
}

export function filesOutsideRootDir(directory, config, rootDir) {
  return rootDir === undefined
    ? []
    : includedFileNames(directory, config)
        .filter((file) => isOutside(rootDir, file))
        .map((file) => relativeTo(directory, file));
}

function mergedOptions(chosen, candidates, { directory, layout }) {
  const options = new Map(candidates.map(({ file }) => [file, parsedTsconfig(file).options]));
  const ordered = [chosen, ...candidates.filter(({ file }) => file !== chosen.file)];
  function optionOf(key) {
    return ordered.map(({ file }) => options.get(file)[key]);
  }
  const libs = optionOf('lib').map((lib) =>
    Array.isArray(lib) ? lib.map((name) => path.basename(name).replace(LIB_FILE, '$1')) : lib,
  );
  const types = union(optionOf('types'));
  const lib = union(libs);
  const inherited = options.get(chosen.file);
  const resetRootDir = escapesRootDir(inherited.rootDir, directory, layout);
  return {
    keptRootDir: resetRootDir ? undefined : inherited.rootDir,
    compilerOptions: {
      ...(types === undefined ? {} : { types }),
      ...(lib === undefined ? {} : { lib }),
      ...Object.fromEntries(
        BUILD_ONLY_OPTIONS.filter((key) => inherited[key] !== undefined).map((key) => [key, UNSET]),
      ),
      ...(resetRootDir ? { rootDir: UNSET } : {}),
    },
    typesFrom:
      types === undefined
        ? []
        : ordered
            .slice(1)
            .filter(({ file }) => options.get(file).types?.length > 0)
            .map(({ file }) => file),
  };
}

function resolved(directory, layout, root) {
  const leaves = leafConfigs(root);
  const candidates = leaves
    .map((file) => coverage(file, directory, layout))
    .filter(({ covered }) => covered > 0);
  if (candidates.length === 0) {
    return undefined;
  }
  const chosen = best(candidates);
  return { ...chosen, ...mergedOptions(chosen, candidates, { directory, layout }) };
}

function cacheKey(directory, name, layout) {
  return JSON.stringify([
    directory,
    name,
    layout.sourceRoots,
    layout.testRoots,
    layout.exclude,
    layout.javascript,
    String(layout.isTestFile),
    String(layout.isSourceFile),
  ]);
}

function withRelativeFiles(found, directory) {
  return found === undefined
    ? undefined
    : {
        ...found,
        file: relativeTo(directory, found.file),
        typesFrom: found.typesFrom.map((file) => relativeTo(directory, file)),
      };
}

export function solutionChoice(directory, layout, name) {
  const root = path.join(directory, name);
  if (!isSolutionTsconfig(readJsonc(root))) {
    return undefined;
  }
  const key = cacheKey(directory, name, layout);
  const entry = readStamped(resolutions, root, () => ({
    key,
    found: resolved(directory, layout, root),
  }));
  return withRelativeFiles(
    entry?.key === key ? entry.found : resolved(directory, layout, root),
    directory,
  );
}

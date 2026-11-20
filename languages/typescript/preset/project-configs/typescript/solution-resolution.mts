import path from 'node:path';
import type TypeScript from 'typescript';
import { textOf } from '../../../../../shared/values/readers.mts';
import { readStamped } from '../../modules/stamped-file-cache.mts';
import type { StampedEntry } from '../../modules/typed/module-types.mts';
import type {
  Coverage,
  MergedOptions,
  SolutionChoice,
  SolutionLayout,
} from '../project-config-types.mts';
import {
  isSourceFile as defaultIsSourceFile,
  isTestFile as defaultIsTestFile,
} from '../../layout.mts';
import {
  configFileNames,
  includedFileNames,
  isSolutionTsconfig,
  parsedTsconfig,
  readJsonc,
  referencedTsconfigs,
} from '../../modules/tsconfig-files.mts';

const LIB_FILE = /^lib\.(.+)\.d\.ts$/u;
const BUILD_ONLY_OPTIONS = ['composite', 'tsBuildInfoFile'];
const resolutions = new Map<
  string,
  StampedEntry<{ key: string; found: SolutionChoice | undefined }>
>();
const UNSET: unknown = JSON.parse('null');

function solutionReferences(file: string): string[] | undefined {
  const config = readJsonc(file);
  return isSolutionTsconfig(config) ? referencedTsconfigs(file, config) : undefined;
}

function leafConfigs(root: string): string[] {
  const queue = new Set([root]);
  const leaves: string[] = [];
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

function relativeTo(directory: string, file: string): string {
  return path.relative(directory, file).split(path.sep).join('/');
}

function coverage(file: string, directory: string, layout: SolutionLayout): Coverage {
  const isTest = typeof layout.isTestFile === 'function' ? layout.isTestFile : defaultIsTestFile;
  const isSource =
    typeof layout.isSourceFile === 'function' ? layout.isSourceFile : defaultIsSourceFile;
  const names = configFileNames(file).map((name) => relativeTo(directory, name));
  const tests = names.filter((name) => isTest(name)).length;
  return { file, tests, covered: tests + names.filter((name) => isSource(name)).length };
}

function best(candidates: readonly Coverage[]): Coverage {
  return candidates.reduce((chosen, next) =>
    next.covered > chosen.covered || (next.covered === chosen.covered && next.tests > chosen.tests)
      ? next
      : chosen,
  );
}

function union(lists: readonly unknown[]): unknown[] | undefined {
  return lists.every(Array.isArray) ? [...new Set<unknown>(lists.flat())] : undefined;
}

function escapesRootDir(
  rootDir: string | undefined,
  directory: string,
  layout: SolutionLayout,
): boolean {
  return (
    rootDir !== undefined &&
    typeof layout.projectCodeFiles === 'function' &&
    layout
      .projectCodeFiles(directory)
      .some((file) => isOutside(rootDir, path.resolve(directory, file)))
  );
}

function isOutside(rootDir: string, file: string): boolean {
  const relative = path.relative(rootDir, file);
  return relative.startsWith('..') || path.isAbsolute(relative);
}

export function filesOutsideRootDir(
  directory: string,
  config: { readonly include: readonly string[]; readonly exclude: readonly string[] },
  rootDir: string | undefined,
): string[] {
  return rootDir === undefined
    ? []
    : includedFileNames(directory, config)
        .filter((file) => isOutside(rootDir, file))
        .map((file) => relativeTo(directory, file));
}

function mergedOptions(
  chosen: Coverage,
  candidates: readonly Coverage[],
  { directory, layout }: { directory: string; layout: SolutionLayout },
): MergedOptions {
  const options = new Map(candidates.map(({ file }) => [file, parsedTsconfig(file).options]));
  function optionsOf(file: string): TypeScript.CompilerOptions {
    return options.get(file) ?? {};
  }
  const ordered = [chosen, ...candidates.filter(({ file }) => file !== chosen.file)];
  function optionOf(key: string): unknown[] {
    return ordered.map(({ file }) => optionsOf(file)[key]);
  }
  const libs = optionOf('lib').map((lib: unknown) =>
    Array.isArray(lib)
      ? lib.map((name: unknown) => path.basename(textOf(name)).replace(LIB_FILE, '$1'))
      : lib,
  );
  const types = union(optionOf('types'));
  const lib = union(libs);
  const inherited = optionsOf(chosen.file);
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
            .filter(({ file }) => (optionsOf(file).types?.length ?? 0) > 0)
            .map(({ file }) => file),
  };
}

function resolved(
  directory: string,
  layout: SolutionLayout,
  root: string,
): SolutionChoice | undefined {
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

function cacheKey(directory: string, name: string, layout: SolutionLayout): string {
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

function withRelativeFiles(
  found: SolutionChoice | undefined,
  directory: string,
): SolutionChoice | undefined {
  return found === undefined
    ? undefined
    : {
        ...found,
        file: relativeTo(directory, found.file),
        typesFrom: found.typesFrom.map((file) => relativeTo(directory, file)),
      };
}

export function solutionChoice(
  directory: string,
  layout: SolutionLayout,
  name: string,
): SolutionChoice | undefined {
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

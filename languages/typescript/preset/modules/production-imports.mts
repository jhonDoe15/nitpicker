import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { lazyTypeScriptApi } from '../../typescript-api/lazy-typescript-api.mts';
import { depthFirst as untypedDepthFirst } from '../../../../shared/traversal.mjs';
import { fieldOf, fieldsOf } from '../../../../shared/values/readers.mts';
import { reachableModules, resolveModuleSpecifier } from './module-resolution.mts';
import { readJsonc } from './tsconfig-files.mts';
import type { EntryFile, ProductionOptions } from './typed/module-types.mts';

const depthFirst: (root: unknown, children: (node: unknown) => unknown[]) => Iterable<unknown> =
  untypedDepthFirst;
const PACKAGE_JSON = /(?:^|\/)package\.json$/u;
const DEPENDENCY_FOLDER = /(?:^|\/)node_modules\//u;
const ENTRY_FIELDS = ['main', 'bin', 'exports'];
const UNLIMITED = { maxDepth: Number.POSITIVE_INFINITY, maxFiles: Number.POSITIVE_INFINITY };

export function specifiersOf(file: string): string[] {
  return existsSync(file)
    ? lazyTypeScriptApi()
        .preProcessFile(readFileSync(file, 'utf8'), true, true)
        .importedFiles.map(({ fileName }) => fileName)
    : [];
}

function childValues(node: unknown): unknown[] {
  return node !== null && typeof node === 'object' ? Object.values(fieldsOf(node)) : [];
}

export function stringLeaves(value: unknown): string[] {
  return [...depthFirst(value, childValues)].filter((node) => typeof node === 'string');
}

function manifestEntries(projectRoot: string, manifest: string): EntryFile[] {
  const directory = path.posix.dirname(manifest);
  const fields = readJsonc(path.join(projectRoot, manifest));
  return ENTRY_FIELDS.flatMap((field) =>
    stringLeaves(fieldOf(fields, field)).map((target) => ({
      file: path.posix.normalize(path.posix.join(directory, target)),
      label: `${manifest} ${field}`,
    })),
  );
}

export function packageEntryFiles(projectRoot: string, files: readonly string[]): EntryFile[] {
  const tracked = new Set(files);
  return files
    .filter((file) => PACKAGE_JSON.test(file) && !DEPENDENCY_FOLDER.test(file))
    .flatMap((manifest) => manifestEntries(projectRoot, manifest))
    .filter(({ file }) => tracked.has(file));
}

export function productionReach(
  projectRoot: string,
  options: ProductionOptions,
): Map<string, string> {
  const { importers } = options;
  const entries = options.entries ?? [];
  const root = realpathSync(projectRoot);
  const starts = [...importers.map((file) => ({ file, label: file })), ...entries];
  const labels = new Map(starts.map(({ file, label }) => [path.join(root, file), label]));
  const reached = new Map(entries.map(({ file, label }) => [file, label]));
  for (const step of reachableModules([...labels.keys()], specifiersOf, UNLIMITED)) {
    if (!('file' in step)) {
      continue;
    }
    const label = labels.get(step.from);
    if (label === undefined) {
      continue;
    }
    labels.set(step.file, label);
    reached.set(path.relative(root, step.file).split(path.sep).join('/'), label);
  }
  return reached;
}

export function directlyImportedFiles(
  projectRoot: string,
  importers: readonly string[],
): Set<string> {
  const root = realpathSync(projectRoot);
  return new Set(
    importers.flatMap((file) => {
      const absolute = path.join(root, file);
      return specifiersOf(absolute)
        .map((specifier) => resolveModuleSpecifier(specifier, absolute).path)
        .filter((target): target is string => target !== undefined && target !== absolute)
        .map((target) => path.relative(root, target).split(path.sep).join('/'));
    }),
  );
}

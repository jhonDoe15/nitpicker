import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { byCodeUnits, isInMutationScope } from '../../../../core/scope/mutation-scope.mjs';
import { sourceFileOf } from '../kotlin/java-classes.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { posix } from '../../builds/lint/lint-staging.mjs';

type PitScope = {
  readonly projectRoot: string;
  readonly mutationScope: unknown;
};
type ScopedTargets = PitScope & {
  readonly classDirectory: string;
  readonly sourceRoots: readonly string[];
};

const posixPath: (file: string) => string = posix;
const compareCodeUnits: (left: string, right: string) => number = byCodeUnits;
const inMutationScope: (file: string, scope: unknown) => boolean = isInMutationScope;

const PACKAGE_DECLARATION = /^\s*(?:@file:\S+\s+)*package\s+([\w.`]+)/mu;
const SOURCE_FILE = /\.(?:java|kt)$/u;
const CLASS_FILE = /\.class$/u;
const DESCRIPTOR_CLASS = /(?:^|\/)(?:package|module)-info\.class$/u;

function filesUnder(directory: string, pattern: RegExp): string[] {
  try {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && pattern.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name));
  } catch (error) {
    if (fieldOf(error, 'code') === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function sourceKey(file: string): string {
  const declared = PACKAGE_DECLARATION.exec(readFileSync(file, 'utf8'))?.[1] ?? '';
  const folders = declared.replaceAll('`', '').split('.').filter(Boolean);
  return [...folders, path.basename(file)].join('/');
}

function scopedSourceKeys({
  sourceRoots,
  projectRoot,
  mutationScope,
}: Omit<ScopedTargets, 'classDirectory'>): Set<string> {
  return new Set(
    sourceRoots
      .flatMap((root) => filesUnder(root, SOURCE_FILE))
      .filter((file) => inMutationScope(posixPath(path.relative(projectRoot, file)), mutationScope))
      .map(sourceKey),
  );
}

function classKey(relative: string, buffer: Buffer): string | undefined {
  const sourceFile = sourceFileOf(buffer);
  const folder = path.posix.dirname(relative);
  if (sourceFile === undefined) {
    return undefined;
  }
  return folder === '.' ? sourceFile : `${folder}/${sourceFile}`;
}

export function scopedPitTargets({ classDirectory, ...scope }: ScopedTargets): string[] {
  const keys = scopedSourceKeys(scope);
  return filesUnder(classDirectory, CLASS_FILE)
    .map((file) => ({ file, relative: posixPath(path.relative(classDirectory, file)) }))
    .filter(({ relative }) => !DESCRIPTOR_CLASS.test(relative))
    .filter(({ file, relative }) => keys.has(classKey(relative, readFileSync(file)) ?? ''))
    .map(({ relative }) => relative.replace(CLASS_FILE, '').replaceAll('/', '.'))
    .toSorted(compareCodeUnits);
}

export function pitTargets(classDirectory: string): string[] {
  const targets = new Set<string>();
  const pending = [{ directory: classDirectory, prefix: '' }];
  for (const { directory, prefix } of pending) {
    const entries = readdirSync(directory, { withFileTypes: true });
    const classes = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.class'))
      .map((entry) => `${prefix}${entry.name.replace(/\.class$/u, '')}`);
    const wholePackage = classes.length > 0 && !'org.pitest.'.startsWith(prefix);
    if (wholePackage) {
      targets.add(`${prefix}*`);
      continue;
    }
    for (const name of classes) {
      targets.add(name);
    }
    pending.push(
      ...entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          directory: path.join(directory, entry.name),
          prefix: `${prefix}${entry.name}.`,
        })),
    );
  }
  return [...targets].toSorted(compareCodeUnits);
}

export function pitRunTargets(
  module: { readonly outputDirectory: string; readonly sourceRoots: readonly string[] },
  scope: PitScope | undefined,
): string[] {
  return scope?.mutationScope === undefined
    ? pitTargets(module.outputDirectory)
    : scopedPitTargets({
        classDirectory: module.outputDirectory,
        sourceRoots: module.sourceRoots,
        ...scope,
      });
}

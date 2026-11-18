import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { projectFilesUnder } from '../../../../../../../shared/project-files/project-files.mjs';

type Manifest = { readonly workspaces?: unknown } & Readonly<Record<string, unknown>>;

const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const SKIPPED_FOLDERS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);
const MAX_FILES = 4000;
const MAX_BYTES = 1_000_000;

const scanFiles: (root: string, options: object) => string[] = projectFilesUnder;
const roots = new Map<string, string | undefined>();
const sources = new Map<string, readonly string[]>();

function readManifest(directory: string): Manifest | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function ancestors(directory: string): string[] {
  const parent = path.dirname(directory);
  return parent === directory ? [directory] : [directory, ...ancestors(parent)];
}

function nearestPackage(filename: string): string | undefined {
  const start = path.dirname(filename);
  if (!roots.has(start)) {
    roots.set(
      start,
      ancestors(start).find((directory) => existsSync(path.join(directory, 'package.json'))),
    );
  }
  return roots.get(start);
}

function scanRoot(filename: string): string | undefined {
  const nearest = nearestPackage(filename);
  if (nearest === undefined) {
    return undefined;
  }
  const workspace = ancestors(nearest).find(
    (directory) => readManifest(directory)?.workspaces !== undefined,
  );
  return workspace ?? nearest;
}

function projectTexts(root: string): readonly string[] {
  const cached = sources.get(root);
  if (cached !== undefined) {
    return cached;
  }
  const files = scanFiles(root, {
    skipDirectory: (_absolute: string, entry: { name: string }) => SKIPPED_FOLDERS.has(entry.name),
  })
    .filter((file) => SOURCE_FILE.test(file))
    .slice(0, MAX_FILES);
  const texts = files.flatMap((file) =>
    statSync(file).size > MAX_BYTES ? [] : [readFileSync(file, 'utf8')],
  );
  sources.set(root, texts);
  return texts;
}

export function packageDependsOn(filename: string, names: readonly string[]): boolean {
  const root = nearestPackage(filename);
  const manifest = root === undefined ? undefined : readManifest(root);
  const tables = ['dependencies', 'devDependencies', 'peerDependencies'].map(
    (key) => manifest?.[key],
  );
  return tables.some(
    (table) =>
      typeof table === 'object' &&
      table !== null &&
      names.some((name) => Object.hasOwn(table, name)),
  );
}

export function projectSourceMatches(filename: string, pattern: RegExp): boolean {
  const root = scanRoot(filename);
  return root !== undefined && projectTexts(root).some((text) => pattern.test(text));
}

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { cachedValue } from '../../../../../../../shared/values/caching/cached-value.mts';
import { parseJson, readTextFile } from './file-reads.mts';
import { projectFilesUnder } from '../../../../../../../shared/project-files/project-files.mjs';
import { ancestorDirectories as untypedAncestorDirectories } from '../../../../../../../shared/filesystem.mjs';

const ancestorDirectories: (directory: string) => string[] = untypedAncestorDirectories;

type Manifest = Readonly<Record<string, unknown>>;

function isManifest(value: unknown): value is Manifest {
  return typeof value === 'object' && value !== null;
}

const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const SKIPPED_FOLDERS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);
const MAX_FILES = 4000;
const MAX_BYTES = 1_000_000;

const scanFiles: (root: string, options: object) => string[] = projectFilesUnder;
const roots = new Map<string, { readonly root: string | undefined }>();
const sources = new Map<string, readonly string[]>();
const verdicts = new Map<string, boolean>();

function readManifest(directory: string): Manifest | undefined {
  const read = readTextFile(path.join(directory, 'package.json'));
  if (read.kind === 'unreadable') {
    return undefined;
  }
  const parsed = parseJson(read.text);
  return parsed.kind === 'parsed' && isManifest(parsed.value) ? parsed.value : undefined;
}

function nearestPackage(filename: string): string | undefined {
  const start = path.dirname(filename);
  return cachedValue(roots, start, () => ({
    root: ancestorDirectories(start).find((directory) =>
      existsSync(path.join(directory, 'package.json')),
    ),
  })).root;
}

function scanRoot(filename: string): string | undefined {
  const nearest = nearestPackage(filename);
  if (nearest === undefined) {
    return undefined;
  }
  const workspace = ancestorDirectories(nearest).find(
    (directory) => readManifest(directory)?.['workspaces'] !== undefined,
  );
  return workspace ?? nearest;
}

function projectFiles(root: string): readonly string[] {
  return cachedValue(sources, root, () =>
    scanFiles(root, {
      skipDirectory: (_absolute: string, entry: { name: string }) =>
        SKIPPED_FOLDERS.has(entry.name),
    })
      .filter((file) => SOURCE_FILE.test(file) && statSync(file).size <= MAX_BYTES)
      .slice(0, MAX_FILES),
  );
}

export function projectSourceFiles(filename: string): readonly string[] {
  const root = scanRoot(filename);
  return root === undefined ? [] : projectFiles(root);
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

function fileMatches(file: string, pattern: RegExp): boolean {
  const read = readTextFile(file);
  return read.kind === 'read' && pattern.test(read.text);
}

export function projectSourceMatches(filename: string, pattern: RegExp): boolean {
  const root = scanRoot(filename);
  const key = `${root ?? ''}\0${pattern.flags}\0${pattern.source}`;
  return cachedValue(verdicts, key, () =>
    projectSourceFiles(filename).some((file) => fileMatches(file, pattern)),
  );
}

import { spawnSync } from 'node:child_process';
import { readdirSync, type Dirent } from 'node:fs';
import path from 'node:path';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';
import { GIT_OUTPUT_LIMIT_BYTES, GIT_TIMEOUT_MS } from '../../../../shared/processes/deadlines.mts';

type CountedRoots = (liveProjectRoot: string) => readonly string[];

type SizeScale = {
  readonly perThousandFiles: number;
  readonly extensions: readonly string[];
  readonly roots?: CountedRoots | undefined;
};

type ModuleScale = { readonly perModuleMs: number; readonly moduleFiles: readonly string[] };

export type FileCounter = (root: string, extensions: readonly string[]) => number;

const FILES_PER_STEP = 1000;

function isCountedRoots(value: unknown): value is CountedRoots {
  return typeof value === 'function';
}

function countedRootsOf(value: unknown): CountedRoots | undefined {
  return isCountedRoots(value) ? value : undefined;
}

function sizeScaleOf(analyzer: unknown, field: string, amountKey: string): SizeScale | undefined {
  const scale = fieldOf(analyzer, field);
  const perThousandFiles = fieldOf(scale, amountKey);
  if (typeof perThousandFiles !== 'number' || perThousandFiles <= 0) {
    return undefined;
  }
  return {
    perThousandFiles,
    extensions: textsOf(fieldOf(scale, 'extensions')),
    roots: countedRootsOf(fieldOf(scale, 'roots')),
  };
}

export function deadlineScaleOf(analyzer: unknown): SizeScale | undefined {
  return sizeScaleOf(analyzer, 'timeoutScale', 'perThousandFilesMs');
}

function moduleScaleOf(analyzer: unknown): ModuleScale | undefined {
  const scale = fieldOf(analyzer, 'timeoutScale');
  const perModuleMs = fieldOf(scale, 'perModuleMs');
  const moduleFiles = textsOf(fieldOf(scale, 'moduleFiles'));
  return typeof perModuleMs === 'number' && perModuleMs > 0 && moduleFiles.length > 0
    ? { perModuleMs, moduleFiles }
    : undefined;
}

export function moduleAllowanceMs(
  analyzer: unknown,
  liveProjectRoot: string,
  countModules: FileCounter = projectModuleCount,
): number {
  const scale = moduleScaleOf(analyzer);
  return scale === undefined
    ? 0
    : countModules(liveProjectRoot, scale.moduleFiles) * scale.perModuleMs;
}

type ProgramCheck = (liveProjectRoot: string) => boolean;

function megabytesOf(scale: unknown, key: string): number {
  const value = fieldOf(scale, key);
  return typeof value === 'number' && value > 0 ? value : 0;
}

function isProgramCheck(value: unknown): value is ProgramCheck {
  return typeof value === 'function';
}

function programMegabytes(scale: unknown, liveProjectRoot: string): number {
  const holds = fieldOf(scale, 'holdsProgram');
  return isProgramCheck(holds) && holds(liveProjectRoot)
    ? megabytesOf(scale, 'programMegabytes')
    : 0;
}

export function memoryEstimateMegabytes(
  analyzer: unknown,
  liveProjectRoot: string,
  countFiles: FileCounter = projectFileCount,
): number {
  const scale = sizeScaleOf(analyzer, 'memoryScale', 'perThousandFilesMegabytes');
  if (scale === undefined) {
    return 0;
  }
  const memoryScale = fieldOf(analyzer, 'memoryScale');
  const files = scaledFileCount(scale, liveProjectRoot, countFiles);
  return Math.round(
    megabytesOf(memoryScale, 'baseMegabytes') +
      programMegabytes(memoryScale, liveProjectRoot) +
      (files / FILES_PER_STEP) * scale.perThousandFiles,
  );
}

export function scaledFileCount(
  scale: SizeScale,
  liveProjectRoot: string,
  countFiles: FileCounter,
): number {
  const roots = scale.roots?.(liveProjectRoot) ?? [liveProjectRoot];
  return roots.reduce((sum, root) => sum + countFiles(root, scale.extensions), 0);
}

export function scaledDeadlineMs(baseMs: number, scale: SizeScale, fileCount: number): number {
  return baseMs + Math.ceil(fileCount / FILES_PER_STEP) * scale.perThousandFiles;
}

export function memoizedFileCounter(): FileCounter {
  const counted = new Map<string, number>();
  return (root, extensions) => {
    const key = JSON.stringify([root, extensions]);
    const count = counted.get(key) ?? projectFileCount(root, extensions);
    counted.set(key, count);
    return count;
  };
}

function listedFileCount(root: string, patterns: readonly string[]): number {
  const listed = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...patterns],
    { cwd: root, encoding: 'utf8', maxBuffer: GIT_OUTPUT_LIMIT_BYTES, timeout: GIT_TIMEOUT_MS },
  );
  return listed.status === 0
    ? listed.stdout.split('\0').filter((file) => file.length > 0).length
    : 0;
}

type FolderEntries = { readonly entries: Dirent[]; readonly error?: unknown };

function entriesOf(folder: string): FolderEntries {
  try {
    return { entries: readdirSync(folder, { withFileTypes: true }) };
  } catch (error) {
    return { entries: [], error };
  }
}

function isWalkable(entry: Dirent): boolean {
  return entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.');
}

function walkedFileCount(root: string, matches: (name: string) => boolean): number {
  let count = 0;
  const folders = [root];
  for (const folder of folders) {
    const { entries } = entriesOf(folder);
    for (const entry of entries.filter(isWalkable)) {
      folders.push(path.join(folder, entry.name));
    }
    count += entries.filter(
      (entry) => !isWalkable(entry) && entry.isFile() && matches(entry.name),
    ).length;
  }
  return count;
}

function countedFiles(
  root: string,
  patterns: readonly string[],
  matches: (name: string) => boolean,
) {
  const listed = listedFileCount(root, patterns);
  return listed > 0 ? listed : walkedFileCount(root, matches);
}

export function projectFileCount(root: string, extensions: readonly string[]): number {
  return countedFiles(
    root,
    extensions.map((extension) => `*.${extension}`),
    (name) => extensions.some((extension) => name.endsWith(`.${extension}`)),
  );
}

export function projectModuleCount(root: string, moduleFiles: readonly string[]): number {
  return countedFiles(
    root,
    moduleFiles.map((name) => `:(glob)**/${name}`),
    (name) => moduleFiles.includes(name),
  );
}

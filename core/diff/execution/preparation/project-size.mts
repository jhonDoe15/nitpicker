import { spawnSync } from 'node:child_process';
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

export function memoryEstimateMegabytes(
  analyzer: unknown,
  liveProjectRoot: string,
  countFiles: FileCounter = projectFileCount,
): number {
  const scale = sizeScaleOf(analyzer, 'memoryScale', 'perThousandFilesMegabytes');
  if (scale === undefined) {
    return 0;
  }
  const files = scaledFileCount(scale, liveProjectRoot, countFiles);
  return Math.round((files / FILES_PER_STEP) * scale.perThousandFiles);
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

export function projectFileCount(root: string, extensions: readonly string[]): number {
  return listedFileCount(
    root,
    extensions.map((extension) => `*.${extension}`),
  );
}

export function projectModuleCount(root: string, moduleFiles: readonly string[]): number {
  return listedFileCount(
    root,
    moduleFiles.map((name) => `:(glob)**/${name}`),
  );
}

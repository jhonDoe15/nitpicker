import { spawnSync } from 'node:child_process';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';
import { GIT_OUTPUT_LIMIT_BYTES, GIT_TIMEOUT_MS } from '../../../../shared/processes/deadlines.mjs';

type SizeScale = {
  readonly perThousandFiles: number;
  readonly extensions: readonly string[];
};

export type FileCounter = (root: string, extensions: readonly string[]) => number;

const FILES_PER_STEP = 1000;

function sizeScaleOf(analyzer: unknown, field: string, amountKey: string): SizeScale | undefined {
  const scale = fieldOf(analyzer, field);
  const perThousandFiles = fieldOf(scale, amountKey);
  if (typeof perThousandFiles !== 'number' || perThousandFiles <= 0) {
    return undefined;
  }
  return { perThousandFiles, extensions: textsOf(fieldOf(scale, 'extensions')) };
}

export function deadlineScaleOf(analyzer: unknown): SizeScale | undefined {
  return sizeScaleOf(analyzer, 'timeoutScale', 'perThousandFilesMs');
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
  const files = countFiles(liveProjectRoot, scale.extensions);
  return Math.round((files / FILES_PER_STEP) * scale.perThousandFiles);
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

export function projectFileCount(root: string, extensions: readonly string[]): number {
  const listed = spawnSync(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      ...extensions.map((extension) => `*.${extension}`),
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: GIT_OUTPUT_LIMIT_BYTES, timeout: GIT_TIMEOUT_MS },
  );
  return listed.status === 0
    ? listed.stdout.split('\0').filter((file) => file.length > 0).length
    : 0;
}

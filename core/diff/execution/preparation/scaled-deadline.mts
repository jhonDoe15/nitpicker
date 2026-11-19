import { spawnSync } from 'node:child_process';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';
import {
  GIT_OUTPUT_LIMIT_BYTES,
  GIT_TIMEOUT_MS,
} from '../../../../shared/processes/deadlines.mjs';

export type DeadlineScale = {
  readonly perThousandFilesMs: number;
  readonly extensions: readonly string[];
};

const FILES_PER_STEP = 1000;
const counted = new Map<string, number>();

export function deadlineScaleOf(analyzer: unknown): DeadlineScale | undefined {
  const scale = fieldOf(analyzer, 'timeoutScale');
  const perThousandFilesMs = fieldOf(scale, 'perThousandFilesMs');
  if (typeof perThousandFilesMs !== 'number' || perThousandFilesMs <= 0) {
    return undefined;
  }
  return { perThousandFilesMs, extensions: textsOf(fieldOf(scale, 'extensions')) };
}

export function scaledDeadlineMs(baseMs: number, scale: DeadlineScale, fileCount: number): number {
  return baseMs + Math.ceil(fileCount / FILES_PER_STEP) * scale.perThousandFilesMs;
}

export function projectFileCount(root: string, extensions: readonly string[]): number {
  const key = JSON.stringify([root, extensions]);
  const known = counted.get(key);
  if (known !== undefined) {
    return known;
  }
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
  const count =
    listed.status === 0 ? listed.stdout.split('\0').filter((file) => file.length > 0).length : 0;
  counted.set(key, count);
  return count;
}

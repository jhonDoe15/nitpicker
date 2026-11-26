import { readFileSync } from 'node:fs';
import { valueOr } from '../../values/attempt/attempt.mts';
import { MEMORY_ADVICE } from './node-heap.mts';
import { machineMemory } from '../machine-capacity.mts';

export type MemoryUse = {
  readonly peak?: number;
  readonly limit: number;
  readonly source: string;
};

type ReadText = (file: string) => string | undefined;

type CgroupFiles = {
  readonly version: string;
  readonly root: string;
  readonly peak: string;
  readonly limit: string;
};

const CGROUP_ROOT = '/sys/fs/cgroup';
const CGROUP_V2: CgroupFiles = {
  version: '0',
  root: CGROUP_ROOT,
  peak: 'memory.peak',
  limit: 'memory.max',
};
const CGROUP_V1: CgroupFiles = {
  version: 'memory',
  root: `${CGROUP_ROOT}/memory`,
  peak: 'memory.max_usage_in_bytes',
  limit: 'memory.limit_in_bytes',
};
const GIB = 1024 ** 3;
const SEE_REPORT = 'see the memory report';

export const MEMORY_TOOL = 'memory';

export const KILL_REMEDY =
  'usually the out-of-memory killer; run fewer jobs at once with NITPICKER_MAX_PARALLEL ' +
  'or give the job more memory';

export const KILL_SENTENCE = ` A SIGKILL usually means the system ran out of memory. ${MEMORY_ADVICE}`;

function readText(file: string): string | undefined {
  return valueOr(() => readFileSync(file, 'utf8').trim(), undefined);
}

function bytesOf(text: string | undefined): number | undefined {
  const value = Number(text);
  return text === undefined || text === '' || !Number.isFinite(value) || value <= 0
    ? undefined
    : value;
}

function ownsLine(files: CgroupFiles, hierarchy: string, controllers: string): boolean {
  return files.version === '0'
    ? hierarchy === '0' && controllers === ''
    : controllers.split(',').includes(files.version);
}

function cgroupPath(files: CgroupFiles, read: ReadText): string | undefined {
  for (const line of (read('/proc/self/cgroup') ?? '').split('\n')) {
    const [hierarchy = '', controllers = '', ...rest] = line.split(':');
    if (rest.length > 0 && ownsLine(files, hierarchy, controllers)) {
      return rest.join(':');
    }
  }
  return undefined;
}

function cgroupUse(files: CgroupFiles, read: ReadText, total: number): MemoryUse | undefined {
  const own = cgroupPath(files, read);
  const folders =
    own === undefined || own === '/' ? [files.root] : [`${files.root}${own}`, files.root];
  for (const folder of folders) {
    const peak = bytesOf(read(`${folder}/${files.peak}`));
    if (peak !== undefined) {
      const limit = bytesOf(read(`${folder}/${files.limit}`));
      const bounded = limit !== undefined && limit < total;
      return {
        peak,
        limit: bounded ? limit : total,
        source: bounded
          ? `cgroup ${files.peak} and ${files.limit}`
          : `cgroup ${files.peak}, machine total`,
      };
    }
  }
  return undefined;
}

export function measuredMemory(
  read: ReadText = readText,
  total: number = machineMemory(),
): MemoryUse {
  return (
    cgroupUse(CGROUP_V2, read, total) ??
    cgroupUse(CGROUP_V1, read, total) ?? { limit: total, source: 'machine total' }
  );
}

export function isMemoryKill(message: unknown): boolean {
  return (
    typeof message === 'string' &&
    (message.includes(`SIGKILL (${KILL_REMEDY})`) || message.includes(KILL_SENTENCE))
  );
}

export function withoutKillRemedy(message: string): string {
  return message.replace(KILL_REMEDY, SEE_REPORT).replace(KILL_SENTENCE, ` (${SEE_REPORT})`);
}

function gigabytes(bytes: number): string {
  return `${(bytes / GIB).toFixed(1)} GB`;
}

function usage({ peak, limit, source }: MemoryUse): string {
  if (peak === undefined) {
    return `The memory limit is ${gigabytes(limit)} (${source}); the peak could not be measured.`;
  }
  return `The measured peak was ${gigabytes(peak)} of a ${gigabytes(limit)} limit (${source}).`;
}

export function memoryKillMessage(analyzers: readonly string[], use: MemoryUse): string {
  return (
    `${String(analyzers.length)} analyzers were killed with SIGKILL in this run ` +
    `(${analyzers.join(', ')}), which almost always means the run ran out of memory. ` +
    `${usage(use)} Run fewer jobs at once with NITPICKER_MAX_PARALLEL, or give the job more ` +
    'memory, and rerun.'
  );
}

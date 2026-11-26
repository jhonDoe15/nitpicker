import { describe, expect, it } from 'vitest';

import {
  isMemoryKill,
  measuredMemory,
  memoryKillMessage,
  withoutKillRemedy,
} from './memory-kills.mts';
import { describeProcessEnd } from '../process-failure.mts';

const GIB = 1024 ** 3;

function files(contents: Record<string, string>): (file: string) => string | undefined {
  return (file) => contents[file];
}

describe('measuredMemory', () => {
  it('reads the peak and the limit of the cgroup v2 the process runs in', () => {
    const read = files({
      '/proc/self/cgroup': '0::/job.slice/run\n',
      '/sys/fs/cgroup/job.slice/run/memory.peak': String(15 * GIB),
      '/sys/fs/cgroup/job.slice/run/memory.max': String(16 * GIB),
    });
    expect(measuredMemory(read, 64 * GIB)).toEqual({
      peak: 15 * GIB,
      limit: 16 * GIB,
      source: 'cgroup memory.peak and memory.max',
    });
  });

  it('uses the machine total when cgroup v2 sets no limit', () => {
    const read = files({
      '/proc/self/cgroup': '0::/\n',
      '/sys/fs/cgroup/memory.peak': String(3 * GIB),
      '/sys/fs/cgroup/memory.max': 'max',
    });
    expect(measuredMemory(read, 8 * GIB)).toEqual({
      peak: 3 * GIB,
      limit: 8 * GIB,
      source: 'cgroup memory.peak, machine total',
    });
  });

  it('falls back to the cgroup v1 memory controller', () => {
    const read = files({
      '/proc/self/cgroup': '5:cpu,cpuacct:/docker/a\n4:memory:/docker/a\n',
      '/sys/fs/cgroup/memory/docker/a/memory.max_usage_in_bytes': String(7 * GIB),
      '/sys/fs/cgroup/memory/docker/a/memory.limit_in_bytes': String(8 * GIB),
    });
    expect(measuredMemory(read, 32 * GIB)).toEqual({
      peak: 7 * GIB,
      limit: 8 * GIB,
      source: 'cgroup memory.max_usage_in_bytes and memory.limit_in_bytes',
    });
  });

  it('gives only the machine total when no cgroup peak can be read', () => {
    expect(measuredMemory(files({}), 8 * GIB)).toEqual({ limit: 8 * GIB, source: 'machine total' });
  });
});

describe('memory kill messages', () => {
  it('recognizes the kill messages of adapters and of the scheduler, not other signals', () => {
    const killed = describeProcessEnd('oxlint', { status: null, signal: 'SIGKILL', stderr: '' });
    expect(isMemoryKill(killed)).toBe(true);
    expect(isMemoryKill('structure crashed with exit 1: child killed by SIGKILL')).toBe(false);
    expect(isMemoryKill('ESLint was terminated by SIGTERM')).toBe(false);
    expect(isMemoryKill(undefined)).toBe(false);
  });

  it('replaces the remedy of a single kill with a pointer to the memory report', () => {
    const killed = describeProcessEnd('ESLint', { status: null, signal: 'SIGKILL', stderr: '' });
    expect(withoutKillRemedy(killed)).toBe('ESLint was killed by SIGKILL (see the memory report)');
  });

  it('names the analyzers, the measured peak and the limit once', () => {
    const message = memoryKillMessage(['eslint-lint', 'structure'], {
      peak: 15.5 * GIB,
      limit: 16 * GIB,
      source: 'cgroup memory.peak and memory.max',
    });
    expect(message).toBe(
      '2 analyzers were killed with SIGKILL in this run (eslint-lint, structure), which almost ' +
        'always means the run ran out of memory. The measured peak was 15.5 GB of a 16.0 GB limit ' +
        '(cgroup memory.peak and memory.max). Run fewer jobs at once with NITPICKER_MAX_PARALLEL, ' +
        'or give the job more memory, and rerun.',
    );
  });

  it('says when the peak could not be measured', () => {
    expect(memoryKillMessage(['a', 'b'], { limit: 8 * GIB, source: 'machine total' })).toContain(
      'The memory limit is 8.0 GB (machine total); the peak could not be measured.',
    );
  });
});

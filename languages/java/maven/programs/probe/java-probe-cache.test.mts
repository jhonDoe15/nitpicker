import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JavaSpawn } from '../../../adapters/typed/java-values.mts';
import { probeJava } from './java-probe-cache.mts';

const FUTURE = new Date('2040-01-01T00:00:00Z');
const roots: string[] = [];

function temporary(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function countingJava(): { java: string; runs: () => number } {
  const directory = temporary('nitpicker-probe-java-');
  const java = path.join(directory, 'java');
  const count = path.join(directory, 'count');
  writeFileSync(count, '');
  writeFileSync(java, `#!/bin/sh\necho x >> ${count}\necho 'openjdk version "21.0.1"' >&2\n`);
  chmodSync(java, 0o755);
  return { java, runs: () => readFileSync(count, 'utf8').split('\n').length - 1 };
}

beforeEach(() => {
  vi.stubEnv('XDG_CACHE_HOME', temporary('nitpicker-probe-cache-'));
});

afterAll(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('probeJava', () => {
  it('runs a java binary once and answers later probes from the cache', () => {
    const { java, runs } = countingJava();
    const first = probeJava(java, ['-version'], spawnSync);
    const second = probeJava(java, ['-version'], spawnSync);

    expect(runs()).toBe(1);
    expect([second.status, second.stderr]).toEqual([first.status, first.stderr]);
    expect(second.stderr).toBe('openjdk version "21.0.1"\n');
  });

  it('keeps a result per argument list', () => {
    const { java, runs } = countingJava();
    probeJava(java, ['-version'], spawnSync);
    probeJava(java, ['-XshowSettings:properties', '-version'], spawnSync);

    expect(runs()).toBe(2);
  });

  it('probes again when the binary changed', () => {
    const { java, runs } = countingJava();
    probeJava(java, ['-version'], spawnSync);
    utimesSync(java, FUTURE, FUTURE);
    probeJava(java, ['-version'], spawnSync);

    expect(runs()).toBe(2);
  });

  it('never caches a probe made through another spawn', () => {
    const { java, runs } = countingJava();
    const calls: string[] = [];
    const spawn: JavaSpawn = (command, args, options) => {
      calls.push(command);
      return spawnSync(command, [...args], options);
    };
    probeJava(java, ['-version'], spawn);
    probeJava(java, ['-version'], spawn);

    expect([calls.length, runs()]).toEqual([2, 2]);
  });

  it('does not cache a failed probe', () => {
    const missing = path.join(temporary('nitpicker-probe-none-'), 'java');
    const first = probeJava(missing, ['-version'], spawnSync);
    const second = probeJava(missing, ['-version'], spawnSync);

    expect(
      [first.error?.message, second.error?.message].every((message) => message?.includes('ENOENT')),
    ).toBe(true);
  });
});

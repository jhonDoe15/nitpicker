import { describe, expect, it } from 'vitest';
import { resolveMaxParallel, runTaskGraph } from './graph/task-graph.mts';
import type { AnalyzerTask } from './tasks.mts';
import { flushScheduling, task } from './test-support/analyzer-task.mts';

const anyNumber: unknown = expect.any(Number);

function release(releases: ReadonlyMap<string, () => void>, name: string): void {
  releases.get(name)?.();
}

describe('analyzer scheduler', () => {
  it('caps the default and accepts an explicit slot count', () => {
    expect(resolveMaxParallel({}, 16)).toBe(4);
    expect(resolveMaxParallel({}, 2)).toBe(2);
    expect(resolveMaxParallel({ NITPICKER_MAX_PARALLEL: '6' }, 2)).toBe(6);
    expect(() => resolveMaxParallel({ NITPICKER_MAX_PARALLEL: '0' }, 4)).toThrow(
      /positive integer/,
    );
  });
  it('runs independent analyzers concurrently within the slot budget', async () => {
    const started: string[] = [];
    const releases = new Map<string, () => void>();
    const execution = runTaskGraph([task('a'), task('b'), task('c')], {
      maxParallel: 2,
      execute: ({ name }: AnalyzerTask) =>
        new Promise((resolve) => {
          started.push(name);
          releases.set(name, () => {
            resolve({ findings: [] });
          });
        }),
    });

    await flushScheduling();
    expect(started).toEqual(['a', 'b']);
    release(releases, 'a');
    await flushScheduling();
    expect(started).toEqual(['a', 'b', 'c']);
    release(releases, 'b');
    release(releases, 'c');

    await expect(execution).resolves.toEqual({
      reports: [
        ['a', { findings: [] }],
        ['b', { findings: [] }],
        ['c', { findings: [] }],
      ],
      errors: [],
      timings: [
        { name: 'a', elapsedMs: anyNumber },
        { name: 'b', elapsedMs: anyNumber },
        { name: 'c', elapsedMs: anyNumber },
      ],
    });
  });
  it('starts higher-priority analyzers first and preserves original result order', async () => {
    const started: string[] = [];
    const releases = new Map<string, () => void>();
    const tasks = [task('default'), task('high', { executionPriority: 1 }), task('equal')];
    const originalTasks = structuredClone(tasks);
    const execution = runTaskGraph(tasks, {
      maxParallel: 1,
      execute: ({ name }: AnalyzerTask) =>
        new Promise((resolve) => {
          started.push(name);
          releases.set(name, () => {
            resolve({ findings: [{ name }] });
          });
        }),
    });

    await flushScheduling();
    expect(started).toEqual(['high']);
    release(releases, 'high');
    await flushScheduling();
    expect(started).toEqual(['high', 'default']);
    release(releases, 'default');
    await flushScheduling();
    expect(started).toEqual(['high', 'default', 'equal']);
    release(releases, 'equal');

    await expect(execution).resolves.toEqual({
      reports: [
        ['default', { findings: [{ name: 'default' }] }],
        ['high', { findings: [{ name: 'high' }] }],
        ['equal', { findings: [{ name: 'equal' }] }],
      ],
      errors: [],
      timings: [
        { name: 'default', elapsedMs: anyNumber },
        { name: 'high', elapsedMs: anyNumber },
        { name: 'equal', elapsedMs: anyNumber },
      ],
    });
    expect(tasks).toEqual(originalTasks);
  });
  it('keeps equal and default priority analyzers in input order', async () => {
    const started: string[] = [];

    await runTaskGraph(
      [
        task('first', { executionPriority: 0 }),
        task('second'),
        task('third', { executionPriority: 0 }),
      ],
      {
        maxParallel: 1,
        execute: ({ name }: AnalyzerTask) => {
          started.push(name);
          return Promise.resolve({ findings: [] });
        },
      },
    );

    expect(started).toEqual(['first', 'second', 'third']);
  });
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY, Number.NaN, null, '1'])(
    'rejects invalid execution priority %s before starting analyzers',
    async (executionPriority) => {
      const started: string[] = [];

      await expect(
        runTaskGraph([task('valid'), { ...task('invalid'), executionPriority }], {
          execute: ({ name }: AnalyzerTask) => {
            started.push(name);
            return Promise.resolve({ findings: [] });
          },
        }),
      ).rejects.toThrow(/executionPriority must be a non-negative safe integer/);
      expect(started).toEqual([]);
    },
  );
  it('reserves weighted capacity for expensive analyzers', async () => {
    const started: string[] = [];
    let releaseCoverage: (() => void) | undefined;
    const execution = runTaskGraph([task('coverage', { concurrencyWeight: 2 }), task('lint')], {
      maxParallel: 2,
      execute: ({ name }: AnalyzerTask) => {
        started.push(name);
        if (name === 'coverage') {
          return new Promise((resolve) => {
            releaseCoverage = () => {
              resolve({ findings: [] });
            };
          });
        }
        return Promise.resolve({ findings: [] });
      },
    });

    await flushScheduling();
    expect(started).toEqual(['coverage']);
    releaseCoverage?.();
    await expect(execution).resolves.toEqual({
      reports: [
        ['coverage', { findings: [] }],
        ['lint', { findings: [] }],
      ],
      errors: [],
      timings: [
        { name: 'coverage', elapsedMs: anyNumber },
        { name: 'lint', elapsedMs: anyNumber },
      ],
    });
    expect(started).toEqual(['coverage', 'lint']);
  });
  it('serializes analyzers that share an exclusive group', async () => {
    const started: string[] = [];
    const releases = new Map<string, () => void>();
    const execution = runTaskGraph(
      [
        task('eslint-a', { concurrencyGroup: 'eslint' }),
        task('eslint-b', { concurrencyGroup: 'eslint', executionPriority: 1 }),
      ],
      {
        maxParallel: 2,
        execute: ({ name }: AnalyzerTask) =>
          new Promise((resolve) => {
            started.push(name);
            releases.set(name, () => {
              resolve({ findings: [] });
            });
          }),
      },
    );

    await flushScheduling();
    expect(started).toEqual(['eslint-b']);
    release(releases, 'eslint-b');
    await flushScheduling();
    expect(started).toEqual(['eslint-b', 'eslint-a']);
    release(releases, 'eslint-a');
    await expect(execution).resolves.toEqual({
      reports: [
        ['eslint-a', { findings: [] }],
        ['eslint-b', { findings: [] }],
      ],
      errors: [],
      timings: [
        { name: 'eslint-a', elapsedMs: anyNumber },
        { name: 'eslint-b', elapsedMs: anyNumber },
      ],
    });
  });
});

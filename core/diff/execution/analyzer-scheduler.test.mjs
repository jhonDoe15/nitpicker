import { describe, expect, it } from 'vitest';
import { resolveMaxParallel, runTaskGraph } from './analyzer-scheduler.mjs';
import { flushScheduling, task } from './test-support/analyzer-task.mjs';

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
    const started = [];
    const releases = new Map();
    const execution = runTaskGraph([task('a'), task('b'), task('c')], {
      maxParallel: 2,
      execute: ({ name }) =>
        new Promise((resolve) => {
          started.push(name);
          releases.set(name, () => {
            resolve({ findings: [] });
          });
        }),
    });

    await flushScheduling();
    expect(started).toEqual(['a', 'b']);
    releases.get('a')();
    await flushScheduling();
    expect(started).toEqual(['a', 'b', 'c']);
    releases.get('b')();
    releases.get('c')();

    await expect(execution).resolves.toEqual({
      reports: [
        ['a', { findings: [] }],
        ['b', { findings: [] }],
        ['c', { findings: [] }],
      ],
      errors: [],
      timings: [
        { name: 'a', elapsedMs: expect.any(Number) },
        { name: 'b', elapsedMs: expect.any(Number) },
        { name: 'c', elapsedMs: expect.any(Number) },
      ],
    });
  });
  it('starts higher-priority analyzers first and preserves original result order', async () => {
    const started = [];
    const releases = new Map();
    const tasks = [task('default'), task('high', { executionPriority: 1 }), task('equal')];
    const originalTasks = structuredClone(tasks);
    const execution = runTaskGraph(tasks, {
      maxParallel: 1,
      execute: ({ name }) =>
        new Promise((resolve) => {
          started.push(name);
          releases.set(name, () => {
            resolve({ findings: [{ name }] });
          });
        }),
    });

    await flushScheduling();
    expect(started).toEqual(['high']);
    releases.get('high')();
    await flushScheduling();
    expect(started).toEqual(['high', 'default']);
    releases.get('default')();
    await flushScheduling();
    expect(started).toEqual(['high', 'default', 'equal']);
    releases.get('equal')();

    await expect(execution).resolves.toEqual({
      reports: [
        ['default', { findings: [{ name: 'default' }] }],
        ['high', { findings: [{ name: 'high' }] }],
        ['equal', { findings: [{ name: 'equal' }] }],
      ],
      errors: [],
      timings: [
        { name: 'default', elapsedMs: expect.any(Number) },
        { name: 'high', elapsedMs: expect.any(Number) },
        { name: 'equal', elapsedMs: expect.any(Number) },
      ],
    });
    expect(tasks).toEqual(originalTasks);
  });
  it('keeps equal and default priority analyzers in input order', async () => {
    const started = [];

    await runTaskGraph(
      [
        task('first', { executionPriority: 0 }),
        task('second'),
        task('third', { executionPriority: 0 }),
      ],
      {
        maxParallel: 1,
        execute: ({ name }) => {
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
      const started = [];

      await expect(
        runTaskGraph([task('valid'), task('invalid', { executionPriority })], {
          execute: ({ name }) => {
            started.push(name);
            return Promise.resolve({ findings: [] });
          },
        }),
      ).rejects.toThrow(/executionPriority must be a non-negative safe integer/);
      expect(started).toEqual([]);
    },
  );
  it('reserves weighted capacity for expensive analyzers', async () => {
    const started = [];
    let releaseCoverage;
    const execution = runTaskGraph([task('coverage', { concurrencyWeight: 2 }), task('lint')], {
      maxParallel: 2,
      execute: ({ name }) => {
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
    releaseCoverage();
    await expect(execution).resolves.toEqual({
      reports: [
        ['coverage', { findings: [] }],
        ['lint', { findings: [] }],
      ],
      errors: [],
      timings: [
        { name: 'coverage', elapsedMs: expect.any(Number) },
        { name: 'lint', elapsedMs: expect.any(Number) },
      ],
    });
    expect(started).toEqual(['coverage', 'lint']);
  });
  it('serializes analyzers that share an exclusive group', async () => {
    const started = [];
    const releases = new Map();
    const execution = runTaskGraph(
      [
        task('eslint-a', { concurrencyGroup: 'eslint' }),
        task('eslint-b', { concurrencyGroup: 'eslint', executionPriority: 1 }),
      ],
      {
        maxParallel: 2,
        execute: ({ name }) =>
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
    releases.get('eslint-b')();
    await flushScheduling();
    expect(started).toEqual(['eslint-b', 'eslint-a']);
    releases.get('eslint-a')();
    await expect(execution).resolves.toEqual({
      reports: [
        ['eslint-a', { findings: [] }],
        ['eslint-b', { findings: [] }],
      ],
      errors: [],
      timings: [
        { name: 'eslint-a', elapsedMs: expect.any(Number) },
        { name: 'eslint-b', elapsedMs: expect.any(Number) },
      ],
    });
  });
});

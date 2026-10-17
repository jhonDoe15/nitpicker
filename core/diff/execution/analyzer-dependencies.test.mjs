import { describe, expect, it } from 'vitest';
import { runTaskGraph } from './analyzer-scheduler.mjs';
import { task } from './test-support/analyzer-task.mjs';

describe('analyzer task graph', () => {
  it('validates the complete graph before starting analyzers', async () => {
    const started = [];
    const invalidTask = { ...task('invalid'), concurrencyWeight: 0 };

    await expect(
      runTaskGraph([task('valid'), invalidTask], {
        execute: ({ name }) => {
          started.push(name);
          return Promise.resolve({ findings: [] });
        },
      }),
    ).rejects.toThrow(/concurrencyWeight must be a positive integer/);
    expect(started).toEqual([]);
  });
  it('rejects dependency cycles before starting analyzers', async () => {
    const started = [];

    await expect(
      runTaskGraph(
        [
          task('coverage', { dependencies: ['crap'] }),
          task('crap', { dependencies: ['coverage'] }),
        ],
        {
          execute: ({ name }) => {
            started.push(name);
            return Promise.resolve({ findings: [] });
          },
        },
      ),
    ).rejects.toThrow('Analyzer dependency cycle: coverage -> crap -> coverage');
    expect(started).toEqual([]);
  });
  it('waits for dependencies and skips dependents after failure', async () => {
    const successfulOrder = [];
    const successful = await runTaskGraph(
      [task('coverage'), task('crap', { dependencies: ['coverage'], executionPriority: 1 })],
      {
        maxParallel: 2,
        execute: ({ name }) => {
          successfulOrder.push(name);
          return Promise.resolve({ findings: [] });
        },
      },
    );
    expect(successful.errors).toEqual([]);
    expect(successfulOrder).toEqual(['coverage', 'crap']);

    const failedOrder = [];
    const failed = await runTaskGraph(
      [task('coverage'), task('crap', { dependencies: ['coverage'], executionPriority: 1 })],
      {
        maxParallel: 2,
        execute: ({ name }) => {
          failedOrder.push(name);
          return Promise.reject(new Error('coverage failed'));
        },
      },
    );
    expect(failedOrder).toEqual(['coverage']);
    expect(failed.errors).toEqual([{ name: 'coverage', message: 'coverage failed' }]);
    expect(failed.skipped).toEqual([{ name: 'crap', because: 'coverage' }]);
    expect(failed.timings).toEqual([
      { name: 'coverage', elapsedMs: expect.any(Number) },
      { name: 'crap', elapsedMs: 0 },
    ]);
  });
  it('reports each analyzer as it settles: done, failed, then skipped', async () => {
    const events = [];

    await runTaskGraph(
      [
        task('coverage'),
        task('crap', { dependencies: ['coverage'], executionPriority: 1 }),
        task('lint'),
      ],
      {
        maxParallel: 2,
        execute: ({ name }) =>
          name === 'coverage'
            ? Promise.reject(new Error('tests failed'))
            : Promise.resolve({ findings: [] }),
        onSettled: (event) => events.push(event),
      },
    );

    expect(events.map(({ name, status }) => `${name}:${status}`).sort()).toEqual([
      'coverage:failed',
      'crap:skipped',
      'lint:done',
    ]);
    expect(events.find(({ name }) => name === 'crap')).toEqual({
      name: 'crap',
      status: 'skipped',
      elapsedMs: expect.any(Number),
      because: 'coverage',
    });
  });
  it('skips every analyzer downstream of a failure without adding errors of their own', async () => {
    const result = await runTaskGraph(
      [
        task('coverage'),
        task('crap', { dependencies: ['coverage'] }),
        task('report', { dependencies: ['crap'] }),
      ],
      { execute: () => Promise.reject(new Error('coverage failed')) },
    );

    expect(result.errors).toEqual([{ name: 'coverage', message: 'coverage failed' }]);
    expect(result.skipped).toEqual([
      { name: 'crap', because: 'coverage' },
      { name: 'report', because: 'coverage' },
    ]);
  });
  it('skips dependents of an analyzer that reports a tool error finding', async () => {
    const started = [];
    const result = await runTaskGraph(
      [task('coverage'), task('crap', { dependencies: ['coverage'] })],
      {
        execute: ({ name }) => {
          started.push(name);
          return Promise.resolve({
            findings: [{ tool: name, rule: 'tests-failed', classification: 'tool-error' }],
          });
        },
      },
    );

    expect(started).toEqual(['coverage']);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toEqual([{ name: 'crap', because: 'coverage' }]);
  });
  it('runs a dependent that tolerates the tools of the tool errors its dependency reports', async () => {
    const started = [];
    const failing = (tool) => ({ tool, rule: 'tests-failed', classification: 'tool-error' });
    const result = await runTaskGraph(
      [
        task('python'),
        task('mutation', { dependencies: ['python'], toleratedDependencyErrors: ['tests'] }),
      ],
      {
        execute: ({ name }) => {
          started.push(name);
          return Promise.resolve({
            findings: name === 'python' ? [failing('tests')] : [],
          });
        },
      },
    );

    expect(started.sort()).toEqual(['mutation', 'python']);
    expect(result.skipped).toBeUndefined();

    const blocked = await runTaskGraph(
      [
        task('python'),
        task('mutation', { dependencies: ['python'], toleratedDependencyErrors: ['tests'] }),
      ],
      { execute: () => Promise.resolve({ findings: [failing('python')] }) },
    );
    expect(blocked.skipped).toEqual([{ name: 'mutation', because: 'python' }]);
  });
  it('still reports a dependency the task graph lacks as an error', async () => {
    const result = await runTaskGraph([task('crap', { dependencies: ['coverage'] })], {
      execute: () => Promise.resolve({ findings: [] }),
    });

    expect(result.errors).toEqual([
      { name: 'crap', message: 'Analyzer dependency coverage is missing for crap' },
    ]);
  });
});

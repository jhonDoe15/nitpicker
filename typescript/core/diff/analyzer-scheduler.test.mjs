import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync, watch } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeAnalyzerTask, resolveMaxParallel, runTaskGraph } from './analyzer-scheduler.mjs';

const schedulerPath = path.join(import.meta.dirname, 'analyzer-scheduler.mjs');

function task(
  name,
  { dependencies = [], concurrencyWeight = 1, concurrencyGroup, executionPriority } = {},
) {
  return {
    name,
    dependencies,
    concurrencyWeight,
    concurrencyGroup,
    executionPriority,
    timeoutMs: 1_000,
    acceptedExitCodes: [0],
    invocation: {
      command: process.execPath,
      args: ['--version'],
      cwd: import.meta.dirname,
    },
  };
}

async function flushScheduling() {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
  }
}

function waitForFile(filePath) {
  if (existsSync(filePath)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const watcher = watch(path.dirname(filePath), () => {
      if (existsSync(filePath)) {
        watcher.close();
        resolve();
      }
    });
    if (existsSync(filePath)) {
      watcher.close();
      resolve();
    }
  });
}

describe('analyzer scheduler', () => {
  it('caps the default and accepts an explicit slot count', () => {
    expect(resolveMaxParallel({}, 16)).toBe(4);
    expect(resolveMaxParallel({}, 2)).toBe(2);
    expect(resolveMaxParallel({ QUALITY_MAX_PARALLEL: '6' }, 2)).toBe(6);
    expect(() => resolveMaxParallel({ QUALITY_MAX_PARALLEL: '0' }, 4)).toThrow(/positive integer/);
  });

  it('runs independent analyzers concurrently within the slot budget', async () => {
    const started = [];
    const releases = new Map();
    const execution = runTaskGraph([task('a'), task('b'), task('c')], {
      maxParallel: 2,
      execute: ({ name }) =>
        new Promise((resolve) => {
          started.push(name);
          releases.set(name, () => resolve({ findings: [] }));
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
          releases.set(name, () => resolve({ findings: [{ name }] }));
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
        execute: async ({ name }) => {
          started.push(name);
          return { findings: [] };
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
          execute: async ({ name }) => {
            started.push(name);
            return { findings: [] };
          },
        }),
      ).rejects.toThrow(/executionPriority must be a non-negative safe integer/);
      expect(started).toEqual([]);
    },
  );

  it('validates the complete graph before starting analyzers', async () => {
    const started = [];
    const invalidTask = { ...task('invalid'), concurrencyWeight: 0 };

    await expect(
      runTaskGraph([task('valid'), invalidTask], {
        execute: async ({ name }) => {
          started.push(name);
          return { findings: [] };
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
          execute: async ({ name }) => {
            started.push(name);
            return { findings: [] };
          },
        },
      ),
    ).rejects.toThrow('Analyzer dependency cycle: coverage -> crap -> coverage');
    expect(started).toEqual([]);
  });

  it('reserves weighted capacity for expensive analyzers', async () => {
    const started = [];
    let releaseCoverage;
    const execution = runTaskGraph([task('coverage', { concurrencyWeight: 2 }), task('lint')], {
      maxParallel: 2,
      execute: ({ name }) => {
        started.push(name);
        if (name === 'coverage') {
          return new Promise((resolve) => {
            releaseCoverage = () => resolve({ findings: [] });
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
            releases.set(name, () => resolve({ findings: [] }));
          }),
      },
    );

    await flushScheduling();
    expect(started).toEqual(['eslint-b']);
    releases.get('eslint-b')();
    await flushScheduling();
    expect(started).toEqual(['eslint-b', 'eslint-a']);
    releases.get('eslint-a')();
    await expect(execution).resolves.toMatchObject({ errors: [] });
  });

  it('waits for dependencies and skips dependents after failure', async () => {
    const successfulOrder = [];
    const successful = await runTaskGraph(
      [task('coverage'), task('crap', { dependencies: ['coverage'], executionPriority: 1 })],
      {
        maxParallel: 2,
        execute: async ({ name }) => {
          successfulOrder.push(name);
          return { findings: [] };
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
        execute: async ({ name }) => {
          failedOrder.push(name);
          throw new Error('coverage failed');
        },
      },
    );
    expect(failedOrder).toEqual(['coverage']);
    expect(failed.errors).toEqual([
      { name: 'coverage', message: 'coverage failed' },
      { name: 'crap', message: 'Analyzer dependency coverage failed or did not run' },
    ]);
    expect(failed.timings).toEqual([
      { name: 'coverage', elapsedMs: expect.any(Number) },
      { name: 'crap', elapsedMs: 0 },
    ]);
  });

  it('force-kills an analyzer that ignores timeout termination', async () => {
    const analyzerTask = task('stuck');
    analyzerTask.timeoutMs = 500;
    analyzerTask.invocation.args = [
      '--input-type=module',
      '-e',
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000)",
    ];

    await expect(executeAnalyzerTask(analyzerTask)).rejects.toThrow('stuck timed out after 500 ms');
  });

  it.each(['SIGINT', 'SIGTERM'])(
    'does not start queued analyzers after %s',
    async (shutdownSignal) => {
      const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'analyzer-scheduler-cancellation-'));
      const activeMarker = path.join(fixtureRoot, 'active');
      const queuedMarker = path.join(fixtureRoot, 'queued');
      const scheduler = spawn(process.execPath, [schedulerPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const tasks = [
        {
          ...task('active'),
          timeoutMs: 10_000,
          invocation: {
            command: process.execPath,
            args: [
              '--input-type=module',
              '-e',
              `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(activeMarker)}, ''); setInterval(() => {}, 1_000);`,
            ],
            cwd: fixtureRoot,
          },
        },
        {
          ...task('queued'),
          timeoutMs: 10_000,
          invocation: {
            command: process.execPath,
            args: [
              '--input-type=module',
              '-e',
              `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(queuedMarker)}, ''); process.stdout.write('{"findings":[]}');`,
            ],
            cwd: fixtureRoot,
          },
        },
      ];

      try {
        scheduler.stdin.end(JSON.stringify({ tasks }));
        await waitForFile(activeMarker);
        scheduler.kill(shutdownSignal);
        const [status] = await once(scheduler, 'close');

        expect(status).toBe(2);
        expect(existsSync(queuedMarker)).toBe(false);
      } finally {
        if (scheduler.exitCode === null && scheduler.signalCode === null) {
          scheduler.kill('SIGKILL');
        }
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    },
  );
});

import {
  expectedOutput71_78,
  expectedOutput93_55,
  expectedOutput320_38,
  expectedOutput382_56,
} from '../fixtures/expected-output/core-diff-analyzer-scheduler.mjs';

import { existsSync, mkdtempSync, rmSync, watch } from 'node:fs';

import { tmpdir } from 'node:os';

import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { executeAnalyzerTask } from './process.mjs';
import { resolveMaxParallel, runTaskGraph } from './analyzer-scheduler.mjs';

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
      cwd: new URL('../', import.meta.url).pathname,
    },
  };
}

const SCHEDULING_TURNS = [1, 2, 3, 4];

async function flushScheduling() {
  for (const turn of SCHEDULING_TURNS) {
    await Promise.resolve(turn);
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
  it('accepts findings of declared wrapped tools and rejects any other tool', async () => {
    const report = (tool) =>
      `process.stdout.write(JSON.stringify({findings:[{tool:'${tool}',rule:'r',path:'a',identity:'i',message:'m',classification:'enforceable'}]}))`;
    const withTool = (tool, reportedTools) => ({
      ...task('wrapper'),
      reportedTools,
      invocation: {
        command: process.execPath,
        args: ['-e', report(tool)],
        cwd: new URL('../', import.meta.url).pathname,
      },
    });

    await expect(executeAnalyzerTask(withTool('inner', ['inner']))).resolves.toEqual(
      expectedOutput71_78(),
    );
    await expect(executeAnalyzerTask(withTool('inner', []))).rejects.toThrow(
      'wrapper emitted a finding for unexpected tool inner',
    );
  });
  it('hides the CI job summary path from analyzers and keeps the rest of the environment', async () => {
    const probe = {
      ...task('probe'),
      invocation: {
        command: process.execPath,
        args: [
          '-e',
          "process.stdout.write(JSON.stringify({findings:[{tool:'probe',rule:'r',path:'a',identity:'i',message:`${process.env.GITHUB_STEP_SUMMARY ?? 'unset'} ${process.env.KEPT}`,classification:'enforceable'}]}))",
        ],
        cwd: new URL('../', import.meta.url).pathname,
        env: { ...process.env, GITHUB_STEP_SUMMARY: '/tmp/summary.md', KEPT: 'kept' },
      },
    };

    await expect(executeAnalyzerTask(probe)).resolves.toEqual(expectedOutput93_55());
  });
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
    await expect(execution).resolves.toEqual(expectedOutput320_38());
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
    expect(events.find(({ name }) => name === 'crap')).toEqual(expectedOutput382_56());
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
  it('still reports a dependency the task graph lacks as an error', async () => {
    const result = await runTaskGraph([task('crap', { dependencies: ['coverage'] })], {
      execute: () => Promise.resolve({ findings: [] }),
    });

    expect(result.errors).toEqual([
      { name: 'crap', message: 'Analyzer dependency coverage is missing for crap' },
    ]);
  });
  it('force-kills an analyzer that ignores timeout termination', async () => {
    // The analyzer marks that its SIGTERM handler is installed, so the timeout can only send a
    // SIGTERM it ignores. The timeout and the SIGKILL after it are timers of this process, so they
    // run on fake time instead of waiting out the real 500 ms and 1 s.
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'analyzer-scheduler-force-kill-'));
    const readyMarker = path.join(fixtureRoot, 'ready');
    const analyzerTask = task('stuck');
    analyzerTask.timeoutMs = 500;
    analyzerTask.invocation.args = [
      '--input-type=module',
      '-e',
      `import { writeFileSync } from 'node:fs'; process.on('SIGTERM', () => {}); writeFileSync(${JSON.stringify(readyMarker)}, ''); setInterval(() => {}, 1_000);`,
    ];

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const outcome = executeAnalyzerTask(analyzerTask);
      await waitForFile(readyMarker);
      vi.advanceTimersByTime(500);
      vi.advanceTimersByTime(1_000);
      await expect(outcome).rejects.toThrow('stuck timed out after 500 ms');
    } finally {
      vi.useRealTimers();
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import { executeAnalyzerTask } from '../process.mts';
import { reportFromAnalyzerOutput } from '../report/analyzer-report.mts';
import type { AnalyzerTask } from '../tasks.mts';
import { task } from '../test-support/analyzer-task.mts';
import { runTaskGraph } from './task-graph.mts';
import {
  admittedHeapMegabytes,
  usableMemoryMegabytes,
  withNodeHeap,
} from '../../../../shared/processes/memory/node-heap.mts';
import { memoryScaleOf as untypedMemoryScaleOf } from '../../../../languages/typescript/preset/diff/memory-scales.mts';

const memoryScaleOf: (
  name: string,
) => { readonly perThousandFilesMegabytes: number; readonly baseMegabytes?: number } | undefined =
  untypedMemoryScaleOf;
const GIB = 1024 ** 3;
const LARGE_PROJECT_THOUSAND_FILES = 15.3;

function estimated(name: string): AnalyzerTask {
  const scale = memoryScaleOf(name);
  const perThousand = scale?.perThousandFilesMegabytes ?? 0;
  return sized(
    name,
    Math.round((scale?.baseMegabytes ?? 0) + perThousand * LARGE_PROJECT_THOUSAND_FILES),
  );
}

async function flushScheduling(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

function sized(name: string, memoryMegabytes: number): AnalyzerTask {
  return { ...task(name), memoryMegabytes };
}

describe('memory-aware scheduling', () => {
  it('starts an analyzer only when its memory estimate fits beside the running ones', async () => {
    const started: string[] = [];
    const releases = new Map<string, () => void>();
    const execution = runTaskGraph([sized('big', 6000), sized('large', 5000), sized('small', 10)], {
      maxParallel: 4,
      memoryMegabytes: 10_000,
      execute: ({ name }: AnalyzerTask) =>
        new Promise((resolve) => {
          started.push(name);
          releases.set(name, () => {
            resolve({ findings: [] });
          });
        }),
    });

    await flushScheduling();
    expect(started).toEqual(['big']);
    releases.get('big')?.();
    await flushScheduling();
    await flushScheduling();
    expect(started).toEqual(['big', 'large', 'small']);
    releases.get('large')?.();
    releases.get('small')?.();
    expect((await execution).errors).toEqual([]);
  });

  it('runs an analyzer larger than the whole budget alone instead of never', async () => {
    const execution = runTaskGraph([sized('huge', 50_000)], {
      memoryMegabytes: 2000,
      execute: () => Promise.resolve({ findings: [] }),
    });

    expect((await execution).errors).toEqual([]);
  });

  it('runs analyzers without an estimate beside a waiting large one', async () => {
    const started: string[] = [];
    const execution = runTaskGraph([sized('first', 1600), sized('second', 1600), task('free')], {
      memoryMegabytes: 2000,
      execute: ({ name }: AnalyzerTask) => {
        started.push(name);
        return name === 'first' ? new Promise(() => undefined) : Promise.resolve({ findings: [] });
      },
    });

    await flushScheduling();
    expect(started).toEqual(['first', 'free']);
    void execution;
  });
});

describe('a 15,300-file project on a 4-core, 10 GB budget', () => {
  it('runs the light analyzers together and the lint pass alone', async () => {
    const running = new Set<string>();
    const together: string[][] = [];
    const names = ['eslint-lint', 'coupling', 'test-runtime', 'coding-standards'];
    const execution = runTaskGraph(names.map(estimated), {
      maxParallel: 4,
      memoryMegabytes: 10_000,
      execute: async ({ name }: AnalyzerTask) => {
        running.add(name);
        together.push([...running].toSorted());
        await flushScheduling();
        running.delete(name);
        return { findings: [] };
      },
    });

    expect((await execution).errors).toEqual([]);
    expect(together).toEqual([
      ['eslint-lint'],
      ['coupling'],
      ['coupling', 'test-runtime'],
      ['coding-standards', 'coupling', 'test-runtime'],
    ]);
  });

  it('gives an analyzer the heap of the memory it was admitted with', () => {
    const budget = { memory: 16 * GIB, parallel: 4, defaultLimit: 2 * GIB };

    expect(admittedHeapMegabytes(budget, 0)).toBe(7680);
    expect(admittedHeapMegabytes(budget, 9000)).toBe(9000);
    expect(admittedHeapMegabytes(budget, 50_000)).toBe(12_288);
    expect(
      withNodeHeap(
        { NITPICKER_MAX_PARALLEL: '4' },
        { budget: { memory: 16 * GIB, defaultLimit: 2 * GIB }, admittedMegabytes: 11_750 },
      ),
    ).toEqual({
      NITPICKER_MAX_PARALLEL: '4',
      NODE_OPTIONS: '--max-old-space-size=11750 --max-semi-space-size=64',
    });
  });

  it.each([{ deno: '2.9.6' }, { bun: '1.3.0' }])(
    'leaves the young generation alone outside Node (%o), where workers fail to start with it',
    (versions) => {
      expect(
        withNodeHeap(
          { NODE_OPTIONS: '--max-old-space-size=4096' },
          {
            budget: { memory: 16 * GIB, defaultLimit: 2 * GIB },
            versions: { node: '24.0.0', ...versions },
          },
        ),
      ).toEqual({ NODE_OPTIONS: '--max-old-space-size=4096' });
    },
  );
});

describe('analyzer memory errors', () => {
  it('names the settings to change when an analyzer runs out of heap', () => {
    const output = {
      status: 134,
      signal: null,
      stdoutText: '',
      stderrText:
        'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
    };

    expect(() => reportFromAnalyzerOutput(task('structure'), output)).toThrow(
      /^structure ran out of memory\. Lower NITPICKER_MAX_PARALLEL .*--max-old-space-size/u,
    );
  });

  it('points a killed analyzer at memory', () => {
    const output = { status: null, signal: 'SIGKILL', stdoutText: '', stderrText: '' };

    expect(() => reportFromAnalyzerOutput(task('coupling'), output)).toThrow(
      /coupling crashed with signal SIGKILL: .*ran out of memory/u,
    );
  });

  async function heapOf(memoryMegabytes: number | undefined): Promise<number> {
    const report = await executeAnalyzerTask({
      ...task('probe'),
      memoryMegabytes,
      invocation: {
        command: process.execPath,
        args: [
          '-e',
          "process.stdout.write(JSON.stringify({findings:[{tool:'probe',rule:'r',path:'a',identity:'i',message:process.env.NODE_OPTIONS ?? 'unset',classification:'enforceable'}]}))",
        ],
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: { PATH: process.env['PATH'] },
      },
    });
    const messages = report.findings.map((finding) => textOf(fieldOf(finding, 'message')));
    return Number(
      /^(?:.* )?--max-old-space-size=(?<megabytes>\d+) --max-semi-space-size=64$/u.exec(
        messages[0] ?? '',
      )?.groups?.['megabytes'],
    );
  }

  it('gives a Node analyzer a heap sized from the machine, and all of it when admitted alone', async () => {
    const shared = await heapOf(undefined);
    const alone = await heapOf(Number.MAX_SAFE_INTEGER);

    expect(shared).toBeGreaterThan(0);
    expect(alone).toBe(usableMemoryMegabytes());
    expect(alone).toBeGreaterThanOrEqual(shared);
  });
});

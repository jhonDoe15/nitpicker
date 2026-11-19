import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import { executeAnalyzerTask } from '../process.mts';
import { reportFromAnalyzerOutput } from '../report/analyzer-report.mts';
import type { AnalyzerTask } from '../tasks.mts';
import { task } from '../test-support/analyzer-task.mts';
import { runTaskGraph } from './task-graph.mts';

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

  it('gives a Node analyzer a heap sized from the machine', async () => {
    const report = await executeAnalyzerTask({
      ...task('probe'),
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
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^(?:.* )?--max-old-space-size=\d+$/u);
  });
});

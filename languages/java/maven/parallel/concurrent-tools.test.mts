import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { temporaryTrees } from '../../test-support/temporary-trees.mts';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import { runToolsConcurrently } from './concurrent-tools.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import { failWith, writeJavaOptions, writeMarker } from './test-support/marker-tools.mts';
import { toolHeapFlags } from './tool-slots.mts';

const TOOLS_URL = checkoutModuleUrl(new URL('test-support/marker-tools.mjs', import.meta.url)).href;
type Task = {
  readonly run: unknown;
  readonly url?: string;
  readonly name?: string;
  readonly options: Readonly<Record<string, string>>;
};

const trees = temporaryTrees('nitpicker-concurrent-tools-');

afterEach(() => {
  trees.cleanup();
  vi.unstubAllEnvs();
});

function markerTasks(count: number): Task[] {
  const root = trees.tree();
  return Array.from({ length: count }, (_, index) => ({
    run: writeMarker,
    url: TOOLS_URL,
    name: 'writeMarker',
    options: { file: path.join(root, `marker-${String(index)}`), text: `tool ${String(index)}` },
  }));
}

function failing(message: string): Task {
  return { run: failWith, url: TOOLS_URL, name: 'failWith', options: { message } };
}

function markers(tasks: readonly Task[]): string[] {
  return tasks.map(({ options }) => readFileSync(textOf(options['file']), 'utf8'));
}

describe('runToolsConcurrently', () => {
  it('runs every tool in a process of its own', () => {
    const tasks = markerTasks(9);

    callUntyped(runToolsConcurrently, tasks, {});

    expect(markers(tasks)).toEqual(tasks.map((_, index) => `tool ${String(index)}`));
  });

  it('throws the error of the first failing tool in task order', () => {
    const tasks = [...markerTasks(1), failing('first failure'), failing('second failure')];

    expect(() => {
      callUntyped(runToolsConcurrently, tasks, {});
    }).toThrow(new Error('first failure'));
    expect(markers(tasks.slice(0, 1))).toEqual(['tool 0']);
  });

  it('sizes the heap of the JVMs a tool starts by the number of tools at once', () => {
    const file = path.join(trees.tree(), 'java-options');
    const task = {
      run: writeJavaOptions,
      url: TOOLS_URL,
      name: 'writeJavaOptions',
      options: { file },
    };
    vi.stubEnv('JDK_JAVA_OPTIONS', '-Dfile.encoding=UTF-8');

    callUntyped(runToolsConcurrently, [task], {});

    expect(readFileSync(file, 'utf8')).toBe(
      [...toolHeapFlags(), '-Dfile.encoding=UTF-8'].join(' '),
    );
  });

  it('runs the tools in order in this process with an injected spawn', () => {
    const calls: unknown[][] = [];
    const spawn = vi.fn();
    const tasks = ['a', 'b'].map((name) => ({
      run: (options: unknown) => {
        calls.push([name, fieldOf(options, 'spawn')]);
      },
      options: {},
    }));

    callUntyped(runToolsConcurrently, tasks, { spawn });

    expect(calls).toEqual([
      ['a', spawn],
      ['b', spawn],
    ]);
  });
});

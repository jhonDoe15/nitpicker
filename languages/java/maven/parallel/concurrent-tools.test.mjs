import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runToolsConcurrently } from './concurrent-tools.mjs';
import { failWith, writeMarker } from './test-support/marker-tools.mjs';

const TOOLS_URL = new URL('test-support/marker-tools.mjs', import.meta.url).href;
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function markerTasks(count) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-concurrent-tools-'));
  roots.push(root);
  return Array.from({ length: count }, (_, index) => ({
    run: writeMarker,
    url: TOOLS_URL,
    name: 'writeMarker',
    options: { file: path.join(root, `marker-${String(index)}`), text: `tool ${String(index)}` },
  }));
}

function failing(message) {
  return { run: failWith, url: TOOLS_URL, name: 'failWith', options: { message } };
}

function markers(tasks) {
  return tasks.map(({ options }) => readFileSync(options.file, 'utf8'));
}

describe('runToolsConcurrently', () => {
  it('runs every tool in a process of its own', () => {
    const tasks = markerTasks(9);

    runToolsConcurrently(tasks, { concurrent: true });

    expect(markers(tasks)).toEqual(tasks.map((_, index) => `tool ${String(index)}`));
  });

  it('throws the error of the first failing tool in task order', () => {
    const tasks = [...markerTasks(1), failing('first failure'), failing('second failure')];

    expect(() => {
      runToolsConcurrently(tasks, { concurrent: true });
    }).toThrow(new Error('first failure'));
    expect(markers(tasks.slice(0, 1))).toEqual(['tool 0']);
  });

  it('runs the tools in order in this process with an injected spawn or outside a quick run', () => {
    const calls = [];
    const spawn = vi.fn();
    const tasks = ['a', 'b'].map((name) => ({
      run: (options) => {
        calls.push([name, options.spawn]);
      },
      options: {},
    }));

    runToolsConcurrently(tasks, { spawn, concurrent: true });
    runToolsConcurrently(tasks, { spawn: undefined, concurrent: false });

    expect(calls).toEqual([
      ['a', spawn],
      ['b', spawn],
      ['a', undefined],
      ['b', undefined],
    ]);
  });
});

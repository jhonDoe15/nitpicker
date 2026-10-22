import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINES_VARIABLE } from '../console-capture.mjs';
import { ROOT_VARIABLE } from '../console-report.mjs';
import { createMochaHooks } from './mocha-capture.mjs';

describe('the Mocha console hooks', () => {
  let directory;
  let linesPath;
  let target;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'mocha-hooks-'));
    linesPath = path.join(directory, 'lines.jsonl');
    target = { error: vi.fn(), warn: vi.fn(), trace: vi.fn(), assert: vi.fn() };
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function hooksFor(environment = { [LINES_VARIABLE]: linesPath, [ROOT_VARIABLE]: '/work/app' }) {
    return createMochaHooks({ target, environment, directory: '/work/app' });
  }

  function entriesWritten() {
    return readFileSync(linesPath, 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line));
  }

  it('attributes a warning to the running test and its file, and to none outside a test', () => {
    const hooks = hooksFor();
    const currentTest = { file: '/work/app/test/a.test.js', fullTitle: () => 'pick answers' };

    target.warn('at load');
    hooks.beforeEach.call({ currentTest });
    target.warn('in test');
    hooks.afterEach.call({ currentTest });
    target.warn('after test');

    expect(entriesWritten()).toEqual([
      { file: '', test: '', messages: ['at load'] },
      { file: '/work/app/test/a.test.js', test: 'pick answers', messages: ['in test'] },
      { file: '', test: '', messages: ['after test'] },
    ]);
  });

  it('gives a test without a file no file', () => {
    const hooks = hooksFor();

    hooks.beforeEach.call({ currentTest: { fullTitle: () => 'orphan' } });
    target.warn('lost');

    expect(entriesWritten()).toEqual([{ file: '', test: 'orphan', messages: ['lost'] }]);
  });

  it('takes the working directory as the project root when none is named', () => {
    hooksFor({ [LINES_VARIABLE]: linesPath });

    target.warn('in /work/app/src');

    expect(entriesWritten()).toEqual([{ file: '', test: '', messages: ['in <root>/src'] }]);
  });
});

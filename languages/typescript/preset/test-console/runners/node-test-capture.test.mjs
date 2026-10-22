import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINES_VARIABLE } from '../console-capture.mjs';
import { ROOT_VARIABLE } from '../console-report.mjs';
import { installNodeTestCapture } from './node-test-capture.mjs';

const FILE = '/work/app/test/a.test.mjs';

describe('the node:test console capture', () => {
  let directory;
  let linesPath;
  let hooks;
  let target;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'node-capture-'));
    linesPath = path.join(directory, 'lines.jsonl');
    hooks = { beforeEach: vi.fn(), afterEach: vi.fn() };
    target = { error: vi.fn(), warn: vi.fn(), trace: vi.fn(), assert: vi.fn() };
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function install(environment, argv = ['node', FILE]) {
    return installNodeTestCapture({ hooks, target, environment, argv, directory: '/work/app' });
  }

  const testProcess = () => ({
    NODE_TEST_CONTEXT: 'child-v8',
    [LINES_VARIABLE]: linesPath,
    [ROOT_VARIABLE]: '/work/app',
  });

  it('attributes each warning to the test file and the innermost running test', () => {
    expect(install(testProcess())).toBe(true);
    const [[before]] = hooks.beforeEach.mock.calls;
    const [[after]] = hooks.afterEach.mock.calls;

    target.warn('while loading');
    before({ name: 'second', fullName: 'suite > second' });
    before({ name: 'inner' });
    target.error('in inner');
    after({ name: 'inner' });
    target.warn('after inner');
    after({ name: 'second', fullName: 'suite > second' });

    expect(
      readFileSync(linesPath, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line)),
    ).toEqual([
      { file: FILE, test: '', messages: ['while loading'] },
      { file: FILE, test: 'inner', messages: ['in inner'] },
      { file: FILE, test: 'suite > second', messages: ['after inner'] },
    ]);
  });

  it('stays out of the process that starts the test files', () => {
    expect(install({ ...testProcess(), NODE_TEST_CONTEXT: undefined })).toBe(false);
    expect(install(testProcess(), ['node'])).toBe(false);

    expect(hooks.beforeEach).not.toHaveBeenCalled();
  });
});

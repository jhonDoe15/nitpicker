import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeNames, captureConsole } from './console-capture.mjs';

const ROOT = '/work/app';

describe('capturing console calls', () => {
  let directory;
  let linesPath;
  let target;
  let original;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'console-capture-'));
    linesPath = path.join(directory, 'lines.jsonl');
    original = { error: vi.fn(), warn: vi.fn(), trace: vi.fn(), assert: vi.fn(), log: vi.fn() };
    target = { ...original };
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function linesWritten() {
    return readFileSync(linesPath, 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line));
  }

  function capture(place = { file: `${ROOT}/a.test.ts`, test: 'works' }) {
    captureConsole({ target, linesPath, root: ROOT, locate: () => place });
  }

  it('records error, warn, trace and a failed assert with their place', () => {
    capture();

    target.error('failed %d times in %s', 3, ROOT);
    target.warn('careful');
    target.trace('where');
    target.trace();
    target.assert(false, 'bad %s', 'input');
    target.assert(0);

    const place = { file: `${ROOT}/a.test.ts`, test: 'works' };
    expect(linesWritten()).toEqual(
      [
        'failed 3 times in <root>',
        'careful',
        'Trace: where',
        'Trace',
        'Assertion failed: bad input',
        'Assertion failed',
      ].map((message) => ({ ...place, messages: [message] })),
    );
  });

  it('still prints what it records', () => {
    capture();

    target.error('failed %d times', 3);
    target.assert(false);

    expect(original.error).toHaveBeenCalledWith('failed %d times', 3);
    expect(original.assert).toHaveBeenCalledWith(false);
  });

  it('leaves log, a passing assert and a call with no text alone', () => {
    capture();

    target.log('plain');
    target.assert(true, 'fine');
    target.error('');

    expect(() => readFileSync(linesPath, 'utf8')).toThrow(/ENOENT/u);
    expect(target.log).toBe(original.log);
  });

  it('does nothing without a lines file', () => {
    captureConsole({ target, linesPath: '', root: ROOT, locate: () => ({ file: 'a', test: '' }) });
    captureConsole({ target, root: ROOT, locate: () => ({ file: 'a', test: '' }) });

    expect(target.error).toBe(original.error);
  });
});

describe('tracking the running tests of a process', () => {
  it('names the innermost running test, and nothing outside a test', () => {
    const active = activeNames();

    expect(active.current()).toBe('');
    active.enter('suite one');
    active.enter('suite one inner');
    expect(active.current()).toBe('suite one inner');
    active.leave('suite one inner');
    expect(active.current()).toBe('suite one');
    active.leave('suite one');
    active.leave('never entered');
    expect(active.current()).toBe('');
  });
});

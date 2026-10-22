import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LINES_VARIABLE,
  PLACE_FILE_VARIABLE,
  PLACE_TEST_VARIABLE,
} from '../../../preset/test-console/console-report.mjs';

const PRELOAD = path.join(import.meta.dirname, 'loaded-sources.cjs');

describe('the console calls the preload records outside node:test', () => {
  let directory;
  let linesPath;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'loaded-console-'));
    linesPath = path.join(directory, 'lines.jsonl');
    vi.stubEnv('NODE_TEST_CONTEXT', '');
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });

  function linesWritten() {
    return readFileSync(linesPath, 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line));
  }

  it('records error, warn, trace and a failed assert at the place a test runner names', async () => {
    const original = {
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      trace: vi.spyOn(console, 'trace').mockImplementation(() => {}),
      assert: vi.spyOn(console, 'assert').mockImplementation(() => {}),
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    };
    vi.stubEnv(LINES_VARIABLE, linesPath);
    vi.stubEnv(PLACE_FILE_VARIABLE, '/p/a.test.js');
    vi.stubEnv(PLACE_TEST_VARIABLE, 'works');

    await import(PRELOAD);
    console.error('failed %d times in %s', 3, 'the cart');
    console.warn('careful');
    console.trace('where');
    console.trace();
    console.assert(false, 'bad %s', 'input');
    console.assert(0);
    console.assert(true, 'fine');
    console.log('plain');
    vi.stubEnv(PLACE_FILE_VARIABLE, '');
    vi.stubEnv(PLACE_TEST_VARIABLE, '');
    console.warn('outside');

    const place = { file: '/p/a.test.js', test: 'works' };
    expect(linesWritten()).toEqual([
      ...[
        'failed 3 times in the cart',
        'careful',
        'Trace: where',
        'Trace',
        'Assertion failed: bad input',
        'Assertion failed',
      ].map((content) => ({ ...place, content })),
      { file: '', test: '', content: 'outside' },
    ]);
    expect(original.error).toHaveBeenCalledWith('failed %d times in %s', 3, 'the cart');
    expect(original.log).toHaveBeenCalledWith('plain');
  });

  it('cuts a long call to 4000 characters', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv(LINES_VARIABLE, linesPath);

    await import(PRELOAD);
    console.warn('a'.repeat(5000));

    expect(linesWritten()[0].content).toHaveLength(4000);
  });

  it('leaves the console alone without the lines variable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv(LINES_VARIABLE, '');

    await import(PRELOAD);

    expect(console.warn).toBe(warn);
  });
});

import { EventEmitter } from 'node:events';
import fs, { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { Console } from 'node:console';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LINES_VARIABLE,
  MAX_CONTENT_LENGTH,
  RUNNER_VARIABLE,
  captureNodeTest,
  recordConsole,
} from './loaded-sources.cjs';

const PLACE = { file: '/p/test/a.test.js', test: 'works' };

describe('recording console calls in a test process', () => {
  let directory;
  let linesPath;
  let printed;
  let target;
  let events;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'console-lines-'));
    linesPath = path.join(directory, 'lines.jsonl');
    printed = new PassThrough();
    target = new Console({ stdout: printed, stderr: printed });
    events = new EventEmitter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  function record(locate = () => PLACE) {
    recordConsole(linesPath, locate, { target, events });
  }

  function linesWritten() {
    return readFileSync(linesPath, 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line));
  }

  it('records error, warn, trace and a failed assert once each, as Node prints them', () => {
    record();

    target.error('failed %d times in %s', 3, 'the cart');
    target.warn('careful');
    target.trace('where');
    target.assert(false, 'bad %s', 'input');
    target.assert(0);
    target.assert(true, 'fine');
    target.log('plain');

    const contents = linesWritten().map(({ file, test, content }) => {
      expect({ file, test }).toEqual(PLACE);
      return content.split('\n')[0];
    });
    expect(contents).toEqual([
      'failed 3 times in the cart',
      'careful',
      'Trace: where',
      'Assertion failed: bad input',
      'Assertion failed',
    ]);
    expect(String(printed.read()).split('\n').slice(0, 3)).toEqual([
      'failed 3 times in the cart',
      'careful',
      'Trace: where',
    ]);
  });

  it('records nothing for a call made where the runner names no place', () => {
    record(() => ({ file: '', test: '' }));

    target.warn('runner noise');

    expect(readFileSync(linesPath, 'utf8')).toBe('');
    expect(String(printed.read())).toBe('runner noise\n');
  });

  it(`cuts a long call to ${String(MAX_CONTENT_LENGTH)} characters`, () => {
    record();

    target.warn('a'.repeat(5000));

    expect(linesWritten()[0].content).toHaveLength(MAX_CONTENT_LENGTH);
  });

  it('writes its line past a test that replaces the public fs functions', () => {
    record();
    const writeSync = vi.spyOn(fs, 'writeSync').mockImplementation(() => 0);
    const appendFileSync = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});

    target.warn('careful');

    expect(writeSync).not.toHaveBeenCalled();
    expect(appendFileSync).not.toHaveBeenCalled();
    expect(linesWritten().map(({ content }) => content)).toEqual(['careful']);
  });

  it('never throws into the console call, even when the place or the file fails', () => {
    recordConsole(path.join(directory, 'missing', 'lines.jsonl'), () => PLACE, {
      target,
      events,
    });
    const other = new Console({ stdout: printed, stderr: printed });
    recordConsole(
      linesPath,
      () => {
        throw new Error('no place');
      },
      { target: other, events },
    );

    target.warn('first');
    other.warn('second');
    events.emit('exit');

    expect(String(printed.read())).toBe('first\nsecond\n');
    expect(readFileSync(linesPath, 'utf8')).toBe('');
  });
});

function fakeTestApi() {
  const hooks = { after: [], afterEach: [], beforeEach: [] };
  return {
    hooks,
    api: {
      after: (hook) => hooks.after.push(hook),
      afterEach: (hook) => hooks.afterEach.push(hook),
      beforeEach: (hook) => hooks.beforeEach.push(hook),
    },
  };
}

describe('the node:test console capture', () => {
  let directory;
  let linesPath;
  let target;
  let testApi;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'node-test-capture-'));
    linesPath = path.join(directory, 'lines.jsonl');
    target = new Console({ stdout: new PassThrough(), stderr: new PassThrough() });
    testApi = fakeTestApi();
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function capture(environment, processIds = { processId: 7, parentId: 5 }) {
    return captureNodeTest({
      environment: { [LINES_VARIABLE]: linesPath, ...environment },
      script: 'test/a.test.js',
      ...processIds,
      testApi: () => testApi.api,
      target,
      events: new EventEmitter(),
    });
  }

  function placesWritten() {
    return readFileSync(linesPath, 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line))
      .map(({ file, test, content }) => [path.relative(process.cwd(), file), test, content]);
  }

  it('names the runner process to its test files and records nothing in it', () => {
    const environment = { [LINES_VARIABLE]: linesPath };

    expect(
      captureNodeTest({ environment, testRunner: true, processId: 5, testApi: () => testApi.api }),
    ).toEqual({ capturing: false });
    expect(environment[RUNNER_VARIABLE]).toBe('5');
    expect(testApi.hooks.beforeEach).toEqual([]);
  });

  it('records a test file the runner started under its file and running test', async () => {
    expect(capture({ NODE_TEST_CONTEXT: 'child-v8', [RUNNER_VARIABLE]: '5' })).toEqual({
      capturing: true,
    });

    target.warn('while loading');
    testApi.hooks.beforeEach[0]({ fullName: 'pick > answers' });
    target.error('inside');
    testApi.hooks.afterEach[0]({ fullName: 'pick > answers' });
    testApi.hooks.after[0]();
    target.warn('in a later after hook');
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    target.warn('a timer after the file');

    expect(placesWritten()).toEqual([
      ['test/a.test.js', '', 'while loading'],
      ['test/a.test.js', 'pick > answers', 'inside'],
      ['test/a.test.js', '', 'in a later after hook'],
    ]);
  });

  it.each([
    { NODE_TEST_CONTEXT: 'child-v8', [RUNNER_VARIABLE]: '9' },
    { NODE_TEST_CONTEXT: 'child-v8' },
    {},
    { [LINES_VARIABLE]: '', NODE_TEST_CONTEXT: 'child-v8', [RUNNER_VARIABLE]: '5' },
  ])(
    'leaves a process a test started alone, and every process without the lines file or a runner',
    (environment) => {
      const { warn } = target;

      expect(capture(environment)).toEqual({ capturing: false });
      expect(target.warn).toBe(warn);
      expect(testApi.hooks.beforeEach).toEqual([]);
    },
  );
});

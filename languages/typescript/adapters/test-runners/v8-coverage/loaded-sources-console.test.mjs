import { AsyncResource } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import fs, { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { Console } from 'node:console';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IN_PROCESS_OPTION,
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

  function mockedFiles(identity) {
    const appended = [];
    const files = {
      ...fs,
      fstatSync: (descriptor) =>
        identity.mocked ? { dev: 8675309, ino: 3 } : fs.fstatSync(descriptor),
      appendInChild: (file, text) => appended.push([file, text]),
    };
    return { appended, files };
  }

  it('keeps its line out of a descriptor a mocked fs gave the same number, and writes it once fs is back', () => {
    const identity = { mocked: false };
    const { appended, files } = mockedFiles(identity);
    recordConsole(linesPath, () => PLACE, { target, events, files });

    identity.mocked = true;
    target.warn('while mocked');
    const whileMocked = readFileSync(linesPath, 'utf8');
    identity.mocked = false;
    target.warn('after restore');

    expect(whileMocked).toBe('');
    expect(linesWritten().map(({ content }) => content)).toEqual(['while mocked', 'after restore']);
    expect(appended).toEqual([]);
  });

  it('hands the lines a mock still holds at exit to a child process', () => {
    const identity = { mocked: false };
    const { appended, files } = mockedFiles(identity);
    recordConsole(linesPath, () => PLACE, { target, events, files });
    identity.mocked = true;

    target.warn('mocked until exit');
    events.emit('exit');

    expect(appended.map(([file, text]) => [file, JSON.parse(text).content])).toEqual([
      [linesPath, 'mocked until exit'],
    ]);
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

  it('keeps the test name through later afterEach hooks and records until the last root after hook', async () => {
    capture({ NODE_TEST_CONTEXT: 'child-v8', [RUNNER_VARIABLE]: '5' });
    const steps = [];
    const context = { fullName: 'pick > answers', after: (step) => steps.push(step) };

    testApi.hooks.beforeEach[0](context);
    testApi.hooks.afterEach[0](context);
    target.warn('in the project afterEach');
    steps.shift()();
    testApi.hooks.after[0](context);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    target.warn('in an async root after hook');
    steps.shift()();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    target.warn('a timer after the file');

    expect(placesWritten()).toEqual([
      ['test/a.test.js', 'pick > answers', 'in the project afterEach'],
      ['test/a.test.js', '', 'in an async root after hook'],
    ]);
  });

  it('records under the node:test resource a call runs in when every file runs in the runner', async () => {
    const environment = { [LINES_VARIABLE]: linesPath };
    const file = path.resolve('test/a.test.js');
    function resource(fields) {
      return Object.assign(new AsyncResource('Test'), fields);
    }
    expect(
      captureNodeTest({
        environment,
        testRunner: true,
        processId: 5,
        inProcess: true,
        target,
        events: new EventEmitter(),
      }),
    ).toEqual({ capturing: true });
    const root = resource({ name: '<root>', entryFile: file });
    const pick = resource({ name: 'pick', parent: root, entryFile: file });
    const answers = resource({ name: 'answers', parent: pick, entryFile: file });
    const hookFile = pathToFileURL(file).href;
    const hook = resource({
      name: 'beforeEach',
      hookType: 'beforeEach',
      parent: pick,
      loc: { file: hookFile },
    });
    const loadTimeWork = root.runInAsyncScope(async () => {
      target.warn('while loading');
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      target.warn('after loading');
    });
    root.entryFile = path.resolve('test/b.test.js');
    await loadTimeWork;
    hook.runInAsyncScope(() => {
      target.warn('in a hook');
    });
    await answers.runInAsyncScope(async () => {
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      target.error('after a wait');
    });
    target.warn('from the runner itself');

    expect([environment[RUNNER_VARIABLE], placesWritten()]).toEqual([
      '5',
      [
        ['test/a.test.js', '', 'while loading'],
        ['test/a.test.js', '', 'after loading'],
        ['test/a.test.js', '', 'in a hook'],
        ['test/a.test.js', '', 'after a wait'],
      ],
    ]);
  });

  it.each([
    ['--test --experimental-test-isolation=none ', true],
    ['--test --test-isolation none ', true],
    ['--test --max-old-space-size=100 --experimental-test-isolation=none', true],
    ['--test --experimental-test-isolation=process ', false],
    ['--test --test-isolation=nonesuch', false],
  ])('tells a runner that runs every file itself from its options "%s"', (options, inProcess) => {
    expect(IN_PROCESS_OPTION.test(options)).toBe(inProcess);
  });

  it('leaves the runner named by an outer run to it, so an inner runner a test starts records nothing', () => {
    const environment = { [LINES_VARIABLE]: linesPath, [RUNNER_VARIABLE]: '5' };

    captureNodeTest({ environment, testRunner: true, processId: 8, testApi: () => testApi.api });

    expect(environment[RUNNER_VARIABLE]).toBe('5');
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

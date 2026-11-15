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
  captureNodeTest as untypedCaptureNodeTest,
  recordConsole as untypedRecordConsole,
} from './loaded-sources.cjs';
import { fieldOf, parseJson, textOf } from '../../../../../shared/values/readers.mts';

type Place = { readonly file: string; readonly test: string };
type WrittenLine = { readonly file: string; readonly test: string; readonly content: string };
type HookContext = {
  readonly fullName: string;
  readonly after?: (step: () => void) => unknown;
};
type Hook = (context?: HookContext) => unknown;
type Hooks = { after: Hook[]; afterEach: Hook[]; beforeEach: Hook[] };
type CaptureOptions = {
  readonly environment?: Record<string, string>;
  readonly script?: string;
  readonly testRunner?: true;
  readonly processId?: number;
  readonly parentId?: number;
  readonly inProcess?: true;
  readonly testApi?: () => unknown;
  readonly target?: Console;
  readonly events?: EventEmitter;
};
type NodeTestResource = AsyncResource & {
  name?: string;
  entryFile?: string | undefined;
  parent?: AsyncResource;
  hookType?: string;
  loc?: { readonly file: string };
};

function recordConsole(
  linesPath: string,
  locate: () => Place,
  options: { readonly target: Console; readonly events: EventEmitter; readonly files?: object },
): void {
  Reflect.apply(untypedRecordConsole, undefined, [linesPath, locate, options]);
}

function captureNodeTest(options: CaptureOptions): { readonly capturing: boolean } {
  const result: unknown = Reflect.apply(untypedCaptureNodeTest, undefined, [options]);
  return { capturing: fieldOf(result, 'capturing') === true };
}

function resource(fields: Partial<NodeTestResource>): NodeTestResource {
  return Object.assign(new AsyncResource('Test'), fields);
}

const PLACE: Place = { file: '/p/test/a.test.js', test: 'works' };

function linesIn(linesPath: string): WrittenLine[] {
  return readFileSync(linesPath, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const parsed = parseJson(line);
      return {
        file: textOf(fieldOf(parsed, 'file')),
        test: textOf(fieldOf(parsed, 'test')),
        content: textOf(fieldOf(parsed, 'content')),
      };
    });
}

describe('recording console calls in a test process', () => {
  let directory: string;
  let linesPath: string;
  let printed: PassThrough;
  let target: Console;
  let events: EventEmitter;

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

  function record(locate: () => Place = () => PLACE): void {
    recordConsole(linesPath, locate, { target, events });
  }

  function linesWritten(): WrittenLine[] {
    return linesIn(linesPath);
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

    const written = linesWritten();
    const contents = written.map(({ content }) => content.split('\n')[0]);
    expect(written.map(({ file, test }) => ({ file, test }))).toEqual(written.map(() => PLACE));
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

    expect(linesWritten()[0]?.content).toHaveLength(MAX_CONTENT_LENGTH);
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

  function mockedFiles(identity: { mocked: boolean }): {
    readonly appended: [string, string][];
    readonly files: object;
  } {
    const appended: [string, string][] = [];
    const files = {
      ...fs,
      fstatSync: (descriptor: number) =>
        identity.mocked ? { dev: 8675309, ino: 3 } : fs.fstatSync(descriptor),
      appendInChild: (file: string, text: string) => appended.push([file, text]),
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

    expect(appended.map(([file, text]) => [file, fieldOf(parseJson(text), 'content')])).toEqual([
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

function fakeTestApi(): {
  readonly hooks: Hooks;
  readonly api: Record<keyof Hooks, (hook: Hook) => unknown>;
} {
  const hooks: Hooks = { after: [], afterEach: [], beforeEach: [] };
  return {
    hooks,
    api: {
      after: (hook: Hook) => hooks.after.push(hook),
      afterEach: (hook: Hook) => hooks.afterEach.push(hook),
      beforeEach: (hook: Hook) => hooks.beforeEach.push(hook),
    },
  };
}

describe('the node:test console capture', () => {
  let directory: string;
  let linesPath: string;
  let target: Console;
  let testApi: ReturnType<typeof fakeTestApi>;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'node-test-capture-'));
    linesPath = path.join(directory, 'lines.jsonl');
    target = new Console({ stdout: new PassThrough(), stderr: new PassThrough() });
    testApi = fakeTestApi();
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function capture(
    environment: Record<string, string>,
    processIds = { processId: 7, parentId: 5 },
  ): { readonly capturing: boolean } {
    return captureNodeTest({
      environment: { [LINES_VARIABLE]: linesPath, ...environment },
      script: 'test/a.test.js',
      ...processIds,
      testApi: () => testApi.api,
      target,
      events: new EventEmitter(),
    });
  }

  function placesWritten(): string[][] {
    return linesIn(linesPath).map(({ file, test, content }) => [
      path.relative(process.cwd(), file),
      test,
      content,
    ]);
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
    testApi.hooks.beforeEach[0]?.({ fullName: 'pick > answers' });
    target.error('inside');
    testApi.hooks.afterEach[0]?.({ fullName: 'pick > answers' });
    testApi.hooks.after[0]?.();
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
    const steps: (() => void)[] = [];
    const context = {
      fullName: 'pick > answers',
      after: (step: () => void) => steps.push(step),
    };

    testApi.hooks.beforeEach[0]?.(context);
    testApi.hooks.afterEach[0]?.(context);
    target.warn('in the project afterEach');
    steps.shift()?.();
    testApi.hooks.after[0]?.(context);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    target.warn('in an async root after hook');
    steps.shift()?.();
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

  it('records the loading of each file when the runner loads the preload inside its root test', async () => {
    const environment = { [LINES_VARIABLE]: linesPath };
    const root = resource({ name: '<root>', entryFile: undefined });
    const loadTimeTimer = root.runInAsyncScope(() => {
      captureNodeTest({
        environment,
        testRunner: true,
        processId: 5,
        inProcess: true,
        target,
        events: new EventEmitter(),
      });
      root.entryFile = path.resolve('test/a.test.js');
      target.warn('while loading a');
      const timer = new Promise<void>((resolve) => {
        setTimeout(() => {
          target.warn('timer from loading a');
          resolve();
        }, 5);
      });
      root.entryFile = path.resolve('test/b.test.js');
      target.warn('while loading b');
      return timer;
    });
    await loadTimeTimer;

    expect(placesWritten()).toEqual([
      ['test/a.test.js', '', 'while loading a'],
      ['test/b.test.js', '', 'while loading b'],
      ['test/a.test.js', '', 'timer from loading a'],
    ]);
  });

  it.each<[string, boolean]>([
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
      const warn: unknown = Reflect.get(target, 'warn');

      expect(capture(environment)).toEqual({ capturing: false });
      expect(Reflect.get(target, 'warn')).toBe(warn);
      expect(testApi.hooks.beforeEach).toEqual([]);
    },
  );
});

import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { LINES_VARIABLE } from '../console-report.mjs';
import { captureMocha, trackMocha } from './mocha-capture.mjs';

const NO_PLACE = { file: '', test: '' };

function fakeMocha() {
  class Runner extends EventEmitter {
    run() {
      return this;
    }
  }
  class Mocha {
    constructor() {
      this.suite = new EventEmitter();
    }
    loadFiles() {
      return this.suite;
    }
  }
  Mocha.Runner = Runner;
  return Mocha;
}

function suite(title, { file, root = false, parent } = {}) {
  return {
    title,
    file,
    root,
    _beforeEach: [],
    _afterEach: [],
    titlePath: () => [...(parent?.titlePath() ?? []), ...(root ? [] : [title])],
  };
}

function test(title, parent) {
  return { title, file: parent.file, parent, titlePath: () => [...parent.titlePath(), title] };
}

function tracked() {
  const Mocha = fakeMocha();
  const storage = new AsyncLocalStorage();
  const place = trackMocha(Mocha, storage);
  const mocha = new Mocha();
  mocha.loadFiles();
  const runner = new Mocha.Runner();
  runner.run();
  return { mocha, runner, place, storage };
}

describe('the Mocha console tracking', () => {
  it('names the loading file, the running test and the suite of an all hook', () => {
    const { mocha, runner, place } = tracked();
    const root = suite('', { root: true });
    const pick = suite('pick', { file: '/p/test/a.test.js', parent: root });
    const answers = test('answers', pick);
    const eachHook = { parent: pick, ctx: { currentTest: answers } };
    pick._beforeEach.push(eachHook);

    mocha.suite.emit('pre-require', {}, '/p/test/a.test.js');
    const loading = place();
    mocha.suite.emit('post-require', {}, '/p/test/a.test.js');
    const loaded = place();
    runner.emit('hook', { parent: pick, file: pick.file });
    const allHook = place();
    runner.emit('test', answers);
    const running = place();
    runner.emit('hook', eachHook);
    const eachHookPlace = place();
    runner.emit('end');

    expect([loading, loaded, allHook, running, eachHookPlace, place()]).toEqual([
      { file: '/p/test/a.test.js', test: '' },
      NO_PLACE,
      { file: '/p/test/a.test.js', test: 'pick' },
      { file: '/p/test/a.test.js', test: 'pick > answers' },
      { file: '/p/test/a.test.js', test: 'pick > answers' },
      NO_PLACE,
    ]);
  });

  it('gives a root hook the file that registered it, and none to a hook from no file', () => {
    const { mocha, runner, place } = tracked();
    const root = suite('', { root: true });
    const fromFile = { parent: root };
    const fromSetup = { parent: root };

    mocha.suite.emit('beforeAll', fromSetup);
    mocha.suite.emit('pre-require', {}, '/p/test/b.test.js');
    mocha.suite.emit('afterAll', fromFile);
    mocha.suite.emit('post-require', {}, '/p/test/b.test.js');
    runner.emit('hook', fromSetup);
    const setupPlace = place();
    runner.emit('hook', fromFile);

    expect([setupPlace, place()]).toEqual([NO_PLACE, { file: '/p/test/b.test.js', test: '' }]);
  });

  it('drops a call from a timer another file started', async () => {
    const { runner, place } = tracked();
    const root = suite('', { root: true });
    const first = suite('a', { file: '/p/test/a.test.js', parent: root });
    const second = suite('b', { file: '/p/test/b.test.js', parent: root });

    runner.emit('test', test('one', first));
    const fromFirst = new Promise((resolve) => {
      setTimeout(() => {
        resolve(place());
      }, 5);
    });
    const sameFile = new Promise((resolve) => {
      setImmediate(() => {
        resolve(place());
      });
    });
    expect(await sameFile).toEqual({ file: '/p/test/a.test.js', test: 'a > one' });
    runner.emit('test', test('two', second));

    expect(await fromFirst).toEqual(NO_PLACE);
    expect(place()).toEqual({ file: '/p/test/b.test.js', test: 'b > two' });
  });

  it('gives the running test a call whose async work a root hook from a required file started', async () => {
    const { runner, place } = tracked();
    const root = suite('', { root: true });
    const api = suite('api', { file: '/p/test/api.test.js', parent: root });

    runner.emit('hook', { parent: root });
    const inRootHook = place();
    const handled = new Promise((resolve) => {
      setTimeout(() => {
        resolve(place());
      }, 5);
    });
    runner.emit('test', test('reports a broken route', api));

    expect([inRootHook, await handled]).toEqual([
      NO_PLACE,
      { file: '/p/test/api.test.js', test: 'api > reports a broken route' },
    ]);
  });

  it('gives the running test of a later file a call whose async work a spec file root hook started', async () => {
    const { mocha, runner, place } = tracked();
    const root = suite('', { root: true });
    const api = suite('api', { file: '/p/test/b.test.js', parent: root });
    const fromFile = { parent: root };

    mocha.suite.emit('pre-require', {}, '/p/test/a.test.js');
    mocha.suite.emit('beforeAll', fromFile);
    mocha.suite.emit('post-require', {}, '/p/test/a.test.js');
    runner.emit('hook', fromFile);
    const inRootHook = place();
    const handled = new Promise((resolve) => {
      setTimeout(() => {
        resolve(place());
      }, 5);
    });
    runner.emit('test', test('reports a broken route', api));

    expect([inRootHook, await handled]).toEqual([
      { file: '/p/test/a.test.js', test: '' },
      { file: '/p/test/b.test.js', test: 'api > reports a broken route' },
    ]);
  });

  it('captures nothing without the lines file or a Mocha to find', async () => {
    const target = { error() {}, warn() {} };

    expect(await captureMocha({ environment: {}, script: '/p/mocha.js', target })).toEqual({
      capturing: false,
    });
    expect(
      await captureMocha({
        environment: { [LINES_VARIABLE]: '/p/lines.jsonl' },
        script: '/nowhere/bin/mocha.js',
        target,
      }),
    ).toEqual({ unavailable: expect.any(Error) });
  });
});

import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import {
  LINES_VARIABLE,
  recordConsole,
} from '../../../adapters/test-runners/v8-coverage/loaded-sources.cjs';
import { loadMochaClass } from '../../../adapters/test-runners/mocha/mocha-files.config.mjs';

const EACH_HOOK_LISTS = ['_beforeEach', '_afterEach'];
const ALL_HOOK_EVENTS = ['beforeAll', 'afterAll'];
const NO_PLACE = { file: '', test: '' };

function absolute(file) {
  return typeof file === 'string' && file !== '' ? path.resolve(file) : '';
}

function titleOf(runnable) {
  return typeof runnable.titlePath === 'function'
    ? runnable.titlePath().join(' > ')
    : runnable.fullTitle();
}

function testPlace(test) {
  return test === undefined ? NO_PLACE : { file: absolute(test.file), test: titleOf(test) };
}

function isEachHook(hook) {
  return EACH_HOOK_LISTS.some((list) => hook.parent?.[list]?.includes(hook) === true);
}

function hookPlace(hook, loadedHookFiles) {
  if (isEachHook(hook)) {
    return testPlace(hook.ctx?.currentTest);
  }
  const suite = hook.parent;
  return {
    file: absolute(hook.file ?? suite?.file ?? loadedHookFiles.get(hook)),
    test: suite === undefined || suite.root === true ? '' : titleOf(suite),
  };
}

function wrapMethod(owner, name, before) {
  const original = owner[name];
  if (typeof original === 'function') {
    owner[name] = function wrapped(...values) {
      before(this);
      return Reflect.apply(original, this, values);
    };
  }
}

function enter(tracking, place) {
  tracking.state.current = place;
  tracking.storage.enterWith(place);
}

function watchLoading(tracking, { suite }) {
  if (tracking.watched.has(suite)) {
    return;
  }
  tracking.watched.add(suite);
  suite.on('pre-require', (_context, file) => {
    tracking.state.loading = absolute(file);
    enter(tracking, { file: tracking.state.loading, test: '' });
  });
  suite.on('post-require', () => {
    tracking.state.loading = '';
    tracking.state.current = NO_PLACE;
  });
  for (const event of ALL_HOOK_EVENTS) {
    suite.on(event, (hook) => {
      tracking.loadedHookFiles.set(hook, tracking.state.loading);
    });
  }
}

function watchRunner(tracking, runner) {
  if (tracking.watched.has(runner)) {
    return;
  }
  tracking.watched.add(runner);
  runner.on('hook', (hook) => {
    enter(tracking, hookPlace(hook, tracking.loadedHookFiles));
  });
  runner.on('test', (test) => {
    enter(tracking, testPlace(test));
  });
  runner.on('end', () => {
    tracking.state.current = NO_PLACE;
  });
}

export function trackMocha(mochaClass, storage = new AsyncLocalStorage()) {
  const tracking = {
    storage,
    state: { current: NO_PLACE, loading: '' },
    loadedHookFiles: new WeakMap(),
    watched: new WeakSet(),
  };
  wrapMethod(mochaClass.prototype, 'loadFiles', (mocha) => {
    watchLoading(tracking, mocha);
  });
  wrapMethod(mochaClass.prototype, 'loadFilesAsync', (mocha) => {
    watchLoading(tracking, mocha);
  });
  wrapMethod(mochaClass.Runner.prototype, 'run', (runner) => {
    watchRunner(tracking, runner);
  });
  return function place() {
    const { current } = tracking.state;
    const origin = storage.getStore() ?? current;
    return origin.file === current.file ? current : NO_PLACE;
  };
}

export async function captureMocha({ environment, script, target = globalThis.console }) {
  const linesPath = environment[LINES_VARIABLE] ?? '';
  if (linesPath === '' || script === '') {
    return { capturing: false };
  }
  try {
    recordConsole(linesPath, trackMocha(await loadMochaClass(script)), { target });
    return { capturing: true };
  } catch (error) {
    return { unavailable: error };
  }
}

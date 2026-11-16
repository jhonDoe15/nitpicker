import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import {
  LINES_VARIABLE,
  recordConsole,
} from '../../../adapters/test-runners/v8-coverage/loaded-sources.cjs';
import type {
  MochaClass,
  MochaHook,
  MochaRunner,
  MochaSuite,
  MochaTest,
  Place,
  Tracking,
} from './mocha-types.mts';
import { loadMochaClass } from '../../../adapters/test-runners/mocha/mocha-class.mts';

const loadMochaClassTyped: (script: string) => Promise<MochaClass> = loadMochaClass;
const recordConsoleTyped: (
  linesPath: string,
  locate: () => Place,
  options: { target: Console | undefined },
) => void = recordConsole;

const EACH_HOOK_LISTS = ['_beforeEach', '_afterEach'] as const;
const ALL_HOOK_EVENTS = ['beforeAll', 'afterAll'] as const;
const NO_PLACE: Place = { file: '', test: '' };

function absolute(file: unknown): string {
  return typeof file === 'string' && file !== '' ? path.resolve(file) : '';
}

function titleOf(runnable: MochaTest | MochaSuite): string {
  return typeof runnable.titlePath === 'function'
    ? runnable.titlePath().join(' > ')
    : runnable.fullTitle();
}

function testPlace(test: MochaTest | undefined): Place {
  return test === undefined ? NO_PLACE : { file: absolute(test.file), test: titleOf(test) };
}

function isEachHook(hook: MochaHook): boolean {
  return EACH_HOOK_LISTS.some((list) => hook.parent?.[list]?.includes(hook) === true);
}

function hookPlace(hook: MochaHook, loadedHookFiles: WeakMap<MochaHook, string>): Place {
  if (isEachHook(hook)) {
    return testPlace(hook.ctx?.currentTest);
  }
  const suite = hook.parent;
  return {
    file: absolute(hook.file ?? suite?.file ?? loadedHookFiles.get(hook)),
    test: suite === undefined || suite.root ? '' : titleOf(suite),
  };
}

function wrapMethod(owner: object, name: string, before: (self: MochaRunner) => void): void {
  const original: unknown = Reflect.get(owner, name);
  if (typeof original === 'function') {
    Reflect.set(owner, name, function wrapped(this: MochaRunner, ...values: unknown[]): unknown {
      before(this);
      const result: unknown = Reflect.apply(original, this, values);
      return result;
    });
  }
}

function loadWithin(tracking: Tracking, owner: object, name: string): void {
  const original: unknown = Reflect.get(owner, name);
  if (typeof original === 'function') {
    Reflect.set(
      owner,
      name,
      function loading(this: { readonly suite: MochaSuite }, ...values: unknown[]): unknown {
        watchLoading(tracking, this);
        return tracking.storage.run(NO_PLACE, (): unknown => Reflect.apply(original, this, values));
      },
    );
  }
}

function isSharedRootHook(hook: MochaHook, loadedFileCounts: WeakMap<MochaSuite, number>): boolean {
  const parent = hook.parent;
  return (parent === undefined ? 0 : (loadedFileCounts.get(parent) ?? 0)) > 1 && !isEachHook(hook);
}

function enter(tracking: Tracking, place: Place, origin: Place = place): void {
  tracking.state.current = place;
  tracking.storage.enterWith(origin);
}

function watchLoading(tracking: Tracking, { suite }: { readonly suite: MochaSuite }): void {
  if (tracking.watched.has(suite)) {
    return;
  }
  tracking.watched.add(suite);
  suite.on('pre-require', (_context, file) => {
    tracking.loadedFileCounts.set(suite, (tracking.loadedFileCounts.get(suite) ?? 0) + 1);
    tracking.state.loading = absolute(file);
    enter(tracking, { file: tracking.state.loading, test: '' });
  });
  suite.on('post-require', () => {
    tracking.state.loading = '';
    enter(tracking, NO_PLACE);
  });
  for (const event of ALL_HOOK_EVENTS) {
    suite.on(event, (hook) => {
      tracking.loadedHookFiles.set(hook, tracking.state.loading);
    });
  }
}

function watchRunner(tracking: Tracking, runner: MochaRunner): void {
  if (tracking.watched.has(runner)) {
    return;
  }
  tracking.watched.add(runner);
  runner.on('hook', (hook) => {
    const place = hookPlace(hook, tracking.loadedHookFiles);
    enter(tracking, place, isSharedRootHook(hook, tracking.loadedFileCounts) ? NO_PLACE : place);
  });
  runner.on('test', (test) => {
    enter(tracking, testPlace(test));
  });
  runner.prependListener('end', () => {
    enter(tracking, NO_PLACE);
  });
}

export function trackMocha(
  mochaClass: MochaClass,
  storage = new AsyncLocalStorage<Place>(),
): () => Place {
  const tracking: Tracking = {
    storage,
    state: { current: NO_PLACE, loading: '' },
    loadedHookFiles: new WeakMap(),
    loadedFileCounts: new WeakMap(),
    watched: new WeakSet(),
  };
  loadWithin(tracking, mochaClass.prototype, 'loadFiles');
  loadWithin(tracking, mochaClass.prototype, 'loadFilesAsync');
  wrapMethod(mochaClass.Runner.prototype, 'run', (runner) => {
    watchRunner(tracking, runner);
  });
  return function place() {
    const { current } = tracking.state;
    const origin = storage.getStore() ?? current;
    return origin.file === '' || origin.file === current.file ? current : origin;
  };
}

export async function captureMocha({
  environment,
  script,
  target,
}: {
  readonly environment: NodeJS.ProcessEnv;
  readonly script: string;
  readonly target?: Console | undefined;
}): Promise<{ readonly capturing: boolean } | { readonly unavailable: unknown }> {
  const linesPath = environment[LINES_VARIABLE] ?? '';
  if (linesPath === '' || script === '') {
    return { capturing: false };
  }
  try {
    recordConsoleTyped(linesPath, trackMocha(await loadMochaClassTyped(script)), { target });
    return { capturing: true };
  } catch (error) {
    return { unavailable: error };
  }
}

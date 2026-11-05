import { describe, expect, it } from 'vitest';
import { file, run, summary, testFile } from '../../test-support/facts.mjs';
import { TIMEOUT_RULE, timeoutFindings } from './timeouts.mjs';

const COROUTINES_IMPORT = { path: 'kotlinx.coroutines.withTimeout', all: false };
const STAR_IMPORT = { path: 'kotlinx.coroutines', all: true };
const SECONDS = { qualifier: 'TimeUnit', name: 'SECONDS' };
const SUPPLY_ASYNC = { receiver: 'CompletableFuture', name: 'supplyAsync' };
const stop = (name, receiver, overrides = {}) => ({ name, receiver, root: receiver, ...overrides });
const get = (overrides = {}) => ({
  line: 4,
  owner: 'Orders',
  function: 'charge',
  kind: 'get',
  receiver: 'future',
  variable: 'future',
  name: 'future',
  unit: SECONDS,
  source: { receiver: 'pool', name: 'submit' },
  visible: true,
  executors: ['pool'],
  threads: [],
  handlers: [{ throws: false, passes: [] }],
  stops: [],
  ...overrides,
});
const future = (kind, source, overrides = {}) => ({
  line: 6,
  owner: '',
  function: 'bounded',
  kind,
  receiver: 'task',
  name: 'task',
  source,
  ...overrides,
});
const block = (awaited, overrides = {}) => ({
  line: 8,
  owner: 'Orders',
  function: 'settle',
  kind: 'withTimeout',
  name: 'withTimeout',
  awaited,
  stops: [],
  ...overrides,
});
const started = (overrides = {}) => ({
  name: 'work',
  scope: 'scope',
  starter: 'async',
  ...overrides,
});

const ROUTE =
  ' If this is intended, add {"rule":"pmd/timeout-abandons-operation","paths":["src/main/kotlin/demo/Sample.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.';
const ASYNC_ADVICE =
  'Run the work as a coroutine under withTimeout, which cancels it, or submit it to an ExecutorService, wait ' +
  'with future.get(timeout, unit) and call cancel(true) on that Future when the TimeoutException arrives.';

const findingsFor = (timeouts, overrides = {}) =>
  run(timeoutFindings, [file({ timeouts, ...overrides })]);

describe('Future.get timeouts in Kotlin', () => {
  it('reports a get whose TimeoutException handler only returns, keyed by its function', () => {
    const findings = findingsFor([get()]);

    expect(summary(findings)).toEqual([`${TIMEOUT_RULE} Orders.charge:get:future 4`]);
    expect(findings[0].tool).toBe('pmd');
    expect(findings[0].message).toBe(
      'future.get(timeout, unit) stops waiting for the future, not for its task: the TimeoutException handler ' +
        'neither cancels this future with cancel(true) nor rethrows, so the task keeps running and a retry ' +
        'overlaps it. Call cancel(true) on this future in the handler or a finally block (cancel(false) lets a ' +
        `running task finish), or rethrow the TimeoutException to the owner.${ROUTE}`,
    );
  });

  it('keys each finding by its own function, so a change elsewhere does not renumber it', () => {
    const both = findingsFor([get(), get({ function: 'refund', line: 9 })]);
    const alone = findingsFor([get({ function: 'refund', line: 3 })]);

    expect(both.map(({ identity }) => identity)).toEqual([
      `${TIMEOUT_RULE}:Orders.charge:get:future`,
      `${TIMEOUT_RULE}:Orders.refund:get:future`,
    ]);
    expect(alone.map(({ identity }) => identity)).toEqual([
      `${TIMEOUT_RULE}:Orders.refund:get:future`,
    ]);
  });

  it.each([
    ['cancels it', get({ stops: [stop('cancel', 'future', { argument: 'true' })] })],
    [
      'cancels it with a flag of unknown value',
      get({ stops: [stop('cancel', 'future', { argument: 'now' })] }),
    ],
    ['shuts its pool down', get({ stops: [stop('shutdownNow', 'pool')] })],
    [
      'interrupts the thread it runs on',
      get({ threads: ['worker'], stops: [stop('interrupt', 'worker')] }),
    ],
    [
      'interrupts a thread for a future from elsewhere',
      get({ visible: false, executors: [], stops: [stop('interrupt', 'worker')] }),
    ],
    [
      'shuts down an executor for a future from elsewhere',
      get({ visible: false, executors: [], stops: [stop('shutdownNow', 'executor')] }),
    ],
    ['rethrows', get({ handlers: [{ throws: true, passes: [] }] })],
    ['hands it to a helper', get({ handlers: [{ throws: false, passes: ['stop'] }] })],
    ['has no timeout handler', get({ handlers: [] })],
  ])('passes a get that %s', (_name, entry) => {
    expect(findingsFor([entry])).toEqual([]);
  });

  it.each([
    ['only shuts the pool down', get({ stops: [stop('shutdown', 'pool')] })],
    [
      'cancels without interrupting',
      get({ stops: [stop('cancel', 'future', { argument: 'false' })] }),
    ],
    ['cancels something else', get({ stops: [stop('cancel', 'timer', { argument: 'true' })] })],
    ['shuts down another pool', get({ stops: [stop('shutdownNow', 'other')] })],
    ['interrupts the waiting thread', get({ stops: [{ name: 'interrupt', root: 'Thread' }] })],
    ['only logs it', get({ handlers: [{ throws: false, passes: ['warn'] }] })],
  ])('reports a get that %s', (_name, entry) => {
    expect(findingsFor([entry])).toHaveLength(1);
  });

  it.each([
    [
      'a two-argument get without a TimeUnit',
      get({ unit: { qualifier: 'cache', name: 'fallback' } }),
    ],
    ['a bare unit that is not imported', get({ unit: { name: 'SECONDS' } })],
    ['a unit that is not a name', get({ unit: undefined })],
  ])('passes %s', (_name, entry) => {
    expect(findingsFor([entry])).toEqual([]);
  });

  it.each([
    [{ path: 'java.util.concurrent.TimeUnit.SECONDS', all: false }, 'SECONDS'],
    [{ path: 'java.util.concurrent.TimeUnit.SECONDS', alias: 'S', all: false }, 'S'],
    [{ path: 'java.util.concurrent.TimeUnit', all: true }, 'SECONDS'],
  ])('reads a unit imported as %j', (imported, name) => {
    expect(findingsFor([get({ unit: { name } })], { imports: [imported] })).toHaveLength(1);
  });

  it('reports a get on a supplyAsync future although it is cancelled', () => {
    const findings = findingsFor([
      get({
        source: { ...SUPPLY_ASYNC, executor: 'pool' },
        stops: [stop('cancel', 'future', { argument: 'true' })],
      }),
    ]);

    expect(findings[0].message).toBe(
      'future.get(timeout, unit) stops waiting, but the task from CompletableFuture.supplyAsync(...) keeps ' +
        'running: cancelling a CompletableFuture never interrupts its task, so cancel(true) does not stop it. ' +
        `${ASYNC_ADVICE}${ROUTE}`,
    );
  });

  it('passes a get on a supplyAsync future whose executor is shut down now', () => {
    const entry = get({
      source: { ...SUPPLY_ASYNC, executor: 'pool' },
      stops: [stop('shutdownNow', 'pool')],
    });

    expect(findingsFor([entry])).toEqual([]);
  });
});

describe('CompletableFuture timeouts in Kotlin', () => {
  it.each(['orTimeout', 'completeOnTimeout'])('reports %s on a future from supplyAsync', (kind) => {
    const findings = findingsFor([future(kind, SUPPLY_ASYNC)]);

    expect(summary(findings)).toEqual([`${TIMEOUT_RULE} bounded:${kind}:task 6`]);
    expect(findings[0].message).toBe(
      `task.${kind}(...) completes the future when the timeout passes, but the task from ` +
        'CompletableFuture.supplyAsync(...) keeps running, because cancelling or completing a ' +
        `CompletableFuture never interrupts it. ${ASYNC_ADVICE}${ROUTE}`,
    );
  });

  it('reports a runAsync future', () => {
    const source = { receiver: 'java.util.concurrent.CompletableFuture', name: 'runAsync' };

    expect(findingsFor([future('orTimeout', source)])).toHaveLength(1);
  });

  it.each([
    ['a manual future', { receiver: 'CompletableFuture', name: 'completedFuture' }],
    ['an unknown source', undefined],
    ['another factory', { receiver: 'Futures', name: 'supplyAsync' }],
  ])('passes orTimeout on %s', (_name, source) => {
    expect(findingsFor([future('orTimeout', source)])).toEqual([]);
  });
});

describe('coroutine timeouts in Kotlin', () => {
  it('reports a timeout block that awaits work started in an outside scope', () => {
    const findings = findingsFor([block([started()])], { imports: [COROUTINES_IMPORT] });

    expect(summary(findings)).toEqual([`${TIMEOUT_RULE} Orders.settle:withTimeout:work 8`]);
    expect(findings[0].message).toBe(
      'withTimeout stops waiting for work, which scope.async started outside the block, so the coroutine ' +
        'keeps running after the timeout. Start the work inside the block, where the timeout cancels it, or ' +
        `cancel work when the TimeoutCancellationException arrives.${ROUTE}`,
    );
  });

  it('accepts the star import and the alias of the timeout function', () => {
    const star = findingsFor([block([started()])], { imports: [STAR_IMPORT] });
    const alias = findingsFor([block([started()], { name: 'limit' })], {
      imports: [{ path: 'kotlinx.coroutines.withTimeout', alias: 'limit', all: false }],
    });

    expect(summary(star)).toEqual([`${TIMEOUT_RULE} Orders.settle:withTimeout:work 8`]);
    expect(summary(alias)).toEqual([`${TIMEOUT_RULE} Orders.settle:withTimeout:work 8`]);
  });

  it.each([
    ['a project withTimeout function', [], block([started()])],
    ['implicit structured scope', [COROUTINES_IMPORT], block([started({ scope: undefined })])],
    [
      'work cancelled in the timeout path',
      [COROUTINES_IMPORT],
      block([started()], { stops: [stop('cancel', 'work')] }),
    ],
    [
      'its scope cancelled',
      [COROUTINES_IMPORT],
      block([started()], { stops: [stop('cancel', 'scope')] }),
    ],
    [
      'the children of its scope cancelled',
      [COROUTINES_IMPORT],
      block([started()], { stops: [{ name: 'cancelChildren', root: 'scope' }] }),
    ],
    ['a deferred of unknown origin', [COROUTINES_IMPORT], block([started({ starter: undefined })])],
    ['nothing awaited outside', [COROUTINES_IMPORT], block([])],
  ])('passes %s', (_name, imports, entry) => {
    expect(findingsFor([entry], { imports })).toEqual([]);
  });

  it('reports a block when only something else is cancelled', () => {
    const entry = block([started()], {
      stops: [stop('cancel', 'other'), stop('shutdownNow', 'scope')],
    });

    expect(findingsFor([entry], { imports: [COROUTINES_IMPORT] })).toHaveLength(1);
  });

  it('leaves test sources alone', () => {
    expect(run(timeoutFindings, [testFile({ timeouts: [get()] })])).toEqual([]);
  });
});

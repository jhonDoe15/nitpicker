import { describe, expect, it } from 'vitest';
import { file, run, summary, testFile } from '../test-support/facts.mjs';
import { TIMEOUT_RULE, timeoutFindings } from './timeouts.mjs';

const COROUTINES_IMPORT = { path: 'kotlinx.coroutines.withTimeout', all: false };
const STAR_IMPORT = { path: 'kotlinx.coroutines', all: true };
const get = (overrides = {}) => ({
  line: 4,
  kind: 'get',
  receiver: 'future',
  handlers: [{ calls: ['warn'], throws: false }],
  finallyCalls: [],
  ...overrides,
});
const future = (kind, source, overrides = {}) => ({
  line: 6,
  kind,
  receiver: 'task',
  source,
  ...overrides,
});
const block = (awaited, overrides = {}) => ({
  line: 8,
  kind: 'withTimeout',
  name: 'withTimeout',
  awaited,
  cancelled: [],
  ...overrides,
});
const started = (overrides = {}) => ({
  name: 'work',
  scope: 'scope',
  starter: 'async',
  ...overrides,
});

const findingsFor = (timeouts, overrides = {}) =>
  run(timeoutFindings, [file({ timeouts, ...overrides })]);

describe('timeouts that abandon work in Kotlin', () => {
  it('reports a Future.get timeout whose TimeoutException handler only returns', () => {
    const findings = findingsFor([get()]);

    expect(summary(findings)).toEqual([`${TIMEOUT_RULE} get:future 4`]);
    expect(findings[0].tool).toBe('pmd');
    expect(findings[0].message).toContain('future.get(timeout, unit) stops waiting');
    expect(findings[0].message).toContain(
      'If this is intended, add {"rule":"pmd/timeout-abandons-operation"',
    );
  });

  it.each([
    ['cancels in the handler', get({ handlers: [{ calls: ['cancel'], throws: false }] })],
    ['shuts the pool down', get({ handlers: [{ calls: ['shutdownNow'], throws: false }] })],
    ['rethrows', get({ handlers: [{ calls: [], throws: true }] })],
    ['cancels in finally', get({ finallyCalls: ['cancel'] })],
    ['has no timeout handler', get({ handlers: [] })],
  ])('passes a Future.get timeout that %s', (_name, entry) => {
    expect(findingsFor([entry])).toEqual([]);
  });

  it.each(['orTimeout', 'completeOnTimeout'])('reports %s on a future from supplyAsync', (kind) => {
    const findings = findingsFor([
      future(kind, { receiver: 'CompletableFuture', name: 'supplyAsync' }),
    ]);

    expect(summary(findings)).toEqual([`${TIMEOUT_RULE} ${kind}:task 6`]);
    expect(findings[0].message).toContain('cancelling a CompletableFuture never interrupts it');
  });

  it.each([
    [
      'a runAsync future',
      'orTimeout',
      { receiver: 'java.util.concurrent.CompletableFuture', name: 'runAsync' },
    ],
  ])('reports %s', (_name, kind, source) => {
    expect(findingsFor([future(kind, source)])).toHaveLength(1);
  });

  it.each([
    ['a manual future', { receiver: 'CompletableFuture', name: 'completedFuture' }],
    ['an unknown source', undefined],
    ['another factory', { receiver: 'Futures', name: 'supplyAsync' }],
  ])('passes orTimeout on %s', (_name, source) => {
    expect(findingsFor([future('orTimeout', source)])).toEqual([]);
  });

  it('reports a timeout block that awaits work started in an outside scope', () => {
    const findings = findingsFor([block([started()])], { imports: [COROUTINES_IMPORT] });

    expect(summary(findings)).toEqual([`${TIMEOUT_RULE} withTimeout:work 8`]);
    expect(findings[0].message).toContain('scope.async started outside the timeout block');
  });

  it('accepts the star import and the alias of the timeout function', () => {
    const star = findingsFor([block([started()])], { imports: [STAR_IMPORT] });
    const alias = findingsFor([block([started()], { name: 'limit' })], {
      imports: [{ path: 'kotlinx.coroutines.withTimeout', alias: 'limit', all: false }],
    });

    expect(summary(star)).toEqual([`${TIMEOUT_RULE} withTimeout:work 8`]);
    expect(summary(alias)).toEqual([`${TIMEOUT_RULE} withTimeout:work 8`]);
  });

  it.each([
    ['a project withTimeout function', [], block([started()])],
    ['implicit structured scope', [COROUTINES_IMPORT], block([started({ scope: undefined })])],
    [
      'work cancelled in the timeout path',
      [COROUTINES_IMPORT],
      block([started()], { cancelled: ['work'] }),
    ],
    ['its scope cancelled', [COROUTINES_IMPORT], block([started()], { cancelled: ['scope'] })],
    ['a deferred of unknown origin', [COROUTINES_IMPORT], block([started({ starter: undefined })])],
    ['nothing awaited outside', [COROUTINES_IMPORT], block([])],
  ])('passes %s', (_name, imports, entry) => {
    expect(findingsFor([entry], { imports })).toEqual([]);
  });

  it('leaves test sources alone', () => {
    expect(run(timeoutFindings, [testFile({ timeouts: [get()] })])).toEqual([]);
  });
});

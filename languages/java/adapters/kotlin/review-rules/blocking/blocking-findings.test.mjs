import { describe, expect, it } from 'vitest';
import { findingFactory } from '../review-finding.mjs';
import { file, fn, klass, routeOf, summary } from '../test-support/facts.mjs';
import { BLOCKING_RULE, blockingFindings } from './blocking-findings.mjs';
import { TIMEOUT_RULE } from './timeouts.mjs';

const IMPORTS = [
  { path: 'kotlinx.coroutines.', alias: undefined, all: true },
  { path: 'java.nio.file.Files', alias: undefined, all: false },
];
const FILES = { path: 'java.nio.file.Files', alias: undefined, all: false };

const call = (name, overrides = {}) => ({
  line: 5,
  name,
  function: 'load',
  qualifier: undefined,
  staticOwner: undefined,
  receiverType: undefined,
  arguments: 1,
  ...overrides,
});
const filesCall = (name = 'readString', overrides = {}) =>
  call(name, { qualifier: 'Files', staticOwner: 'Files', ...overrides });
const timeout = (calls, overrides = {}) => ({
  line: 4,
  builder: 'withTimeout',
  function: 'load',
  calls,
  references: [],
  whileLoops: 0,
  opaqueLoops: 0,
  ...overrides,
});
const source = (coroutines, overrides = {}) => file({ imports: IMPORTS, coroutines, ...overrides });
const findingsFor = (coroutines, extra = [], overrides = {}) =>
  blockingFindings([source(coroutines, overrides)], {
    finding: findingFactory(),
    declaredIn: [source(coroutines, overrides), ...extra],
  });

describe('blocking calls in Kotlin coroutine code', () => {
  it('reports a java.nio.file.Files call with the offload, the cancellation limit and the route', () => {
    const findings = findingsFor({ calls: [filesCall()], timeouts: [] });

    expect(summary(findings)).toEqual([`${BLOCKING_RULE} load.Files.readString 5`]);
    expect(findings[0].message).toContain('withContext(Dispatchers.IO)');
    expect(findings[0].message).toContain('a cancellation cannot interrupt it');
    expect(routeOf(findings[0].message)).toContain('"rule":"pmd/BlockingCallInCoroutine"');
  });

  it.each([
    [
      'a File extension on a declared File',
      call('readText', { qualifier: 'file', receiverType: 'File' }),
    ],
    [
      'a JDBC statement',
      call('executeQuery', { qualifier: 'st', receiverType: 'PreparedStatement' }),
    ],
    ['a Future get', call('get', { qualifier: 'future', receiverType: 'Future' })],
    [
      'a CountDownLatch await',
      call('await', { qualifier: 'latch', receiverType: 'CountDownLatch' }),
    ],
    ['a BlockingQueue take', call('take', { qualifier: 'queue', receiverType: 'BlockingQueue' })],
    ['a readLine', call('readLine', { arguments: 0 })],
  ])('reports %s', (_name, entry) => {
    const imports = [
      ...IMPORTS,
      ...['java.io.File', 'java.sql.PreparedStatement', 'java.util.concurrent.Future'].map(
        (path) => ({ path, all: false }),
      ),
      ...['java.util.concurrent.CountDownLatch', 'java.util.concurrent.BlockingQueue'].map(
        (path) => ({ path, all: false }),
      ),
    ];

    expect(
      findingsFor({ calls: [entry], timeouts: [] }, [], { imports }).map(({ rule }) => rule),
    ).toEqual([BLOCKING_RULE]);
  });

  it.each([
    [
      'Thread.sleep, which detekt reports',
      call('sleep', { qualifier: 'Thread', staticOwner: 'Thread' }),
    ],
    ['an unknown receiver type', call('get', { qualifier: 'x', receiverType: 'Thing' })],
    [
      'a File method when File is not java.io.File',
      call('readText', { qualifier: 'f', receiverType: 'Config' }),
    ],
    [
      'a repository declared with suspend methods',
      call('findAll', { qualifier: 'repo', receiverType: 'Orders' }),
    ],
    ['a plain function', call('compute')],
  ])('does not report %s', (_name, entry) => {
    expect(findingsFor({ calls: [entry], timeouts: [] })).toEqual([]);
  });

  it('does not report a program without recorded coroutine code or a test file', () => {
    expect(findingsFor(null)).toEqual([]);
    expect(findingsFor({ calls: [filesCall()], timeouts: [] }, [], { test: true })).toEqual([]);
  });

  it('keeps the same identity when the call moves to another line', () => {
    const at = (line) =>
      findingsFor({ calls: [filesCall('readString', { line })], timeouts: [] })[0].identity;

    expect(at(5)).toBe(at(40));
  });

  it('reports a Spring Data repository call but not a suspending one', () => {
    const repository = klass('Orders', { kind: 'interface', supers: ['CrudRepository'] });
    const imports = [
      ...IMPORTS,
      { path: 'org.springframework.data.repository.CrudRepository', all: false },
    ];
    const entry = call('findAll', { qualifier: 'orders', receiverType: 'Orders' });
    const declared = file({ imports, classes: [repository] });

    const reported = blockingFindings([source({ calls: [entry], timeouts: [] }, { imports })], {
      finding: findingFactory(),
      declaredIn: [declared],
    });
    const suspending = blockingFindings([source({ calls: [entry], timeouts: [] }, { imports })], {
      finding: findingFactory(),
      declaredIn: [declared, file({ functions: [fn('findAll', { modifiers: ['suspend'] })] })],
    });

    expect(reported.map(({ rule }) => rule)).toEqual([BLOCKING_RULE]);
    expect(suspending).toEqual([]);
  });
});

describe('timeout blocks without a suspension point in Kotlin', () => {
  it('reports a withTimeout block that only calls a blocking API and not the call twice', () => {
    const entry = filesCall();
    const findings = findingsFor({ calls: [entry], timeouts: [timeout([entry])] });

    expect(summary(findings)).toEqual([`${TIMEOUT_RULE} load.withTimeout 4`]);
    expect(findings[0].message).toContain('runInterruptible(Dispatchers.IO)');
  });

  it('reports a block that calls a plain function of the project', () => {
    const plain = file({ functions: [fn('compute')] });
    const findings = findingsFor({ calls: [], timeouts: [timeout([call('compute')])] }, [plain]);

    expect(summary(findings)).toEqual([`${TIMEOUT_RULE} load.withTimeout 4`]);
  });

  it.each([
    ['a call that might suspend', timeout([filesCall(), call('fetch')])],
    ['a call that the project declares suspend', timeout([call('compute')])],
    ['isActive polled in the block', timeout([filesCall()], { references: ['isActive'] })],
    ['a loop over something that may suspend', timeout([filesCall()], { opaqueLoops: 1 })],
    ['a block that only calls standard functions', timeout([call('println')])],
  ])('does not report %s', (_name, entry) => {
    const suspending = file({ functions: [fn('compute', { modifiers: ['suspend'] })] });

    expect(findingsFor({ calls: [], timeouts: [entry] }, [suspending])).toEqual([]);
  });

  it('does not report in a file that does not import kotlinx.coroutines', () => {
    expect(
      findingsFor({ calls: [], timeouts: [timeout([filesCall()])] }, [], { imports: [FILES] }),
    ).toEqual([]);
  });
});

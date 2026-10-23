import { describe, expect, it } from 'vitest';
import {
  cleanupCall,
  file,
  fn,
  importOf,
  klass,
  run,
  sourceRouted,
  summary,
} from '../test-support/facts.mjs';
import { SUSPEND_CLEANUP_RULE, suspendCleanupFindings } from './suspend-cleanup.mjs';

const BOUNDED =
  'run the release as `withContext(NonCancellable) { withTimeout(5.seconds) { ... } }` so it finishes after cancellation but cannot wait forever, and shield only the release itself, in the scope that opened the resource.';
const COROUTINES = importOf('kotlinx.coroutines', { all: true });
const SYNC = importOf('kotlinx.coroutines.sync', { all: true });
const CHANNELS = importOf('kotlinx.coroutines.channels', { all: true });
const suspendFun = (name, overrides = {}) =>
  fn(name, { owner: 'Store', modifiers: ['suspend'], ...overrides });
const findingsFor = (calls, overrides = {}) =>
  run(suspendCleanupFindings, [file({ imports: [COROUTINES], cleanupCalls: calls, ...overrides })]);

describe('suspending cleanup in finally', () => {
  it('reports a kotlinx.coroutines call with the tool, rule, exception route and a bounded alternative', () => {
    const findings = findingsFor([cleanupCall('delay', { line: 12 })]);

    expect(summary(findings)).toEqual([`${SUSPEND_CLEANUP_RULE} Store.close:delay 12`]);
    expect(findings[0].tool).toBe('kotlin-source');
    expect(findings[0].message).toBe(
      sourceRouted(
        `This \`finally\` block calls the suspending \`delay()\`, which throws as soon as the coroutine is cancelled, so the rest of the cleanup is skipped and the resource stays open. Make the release non-suspending (a blocking \`close()\`), or ${BOUNDED}`,
        SUSPEND_CLEANUP_RULE,
      ),
    );
  });

  it.each([
    ['delay', {}],
    ['yield', {}],
    ['withTimeout', {}],
    ['coroutineScope', {}],
    ['supervisorScope', {}],
    ['awaitCancellation', {}],
    ['suspendCancellableCoroutine', {}],
    ['withContext', { context: 'Dispatchers.IO' }],
    ['withContext', { context: 'Dispatchers.IO + CoroutineName("close")' }],
  ])('reports %s', (name, extra) => {
    expect(findingsFor([cleanupCall(name, extra)])).toHaveLength(1);
  });

  it('reports a suspend function declared in the same class, also through this', () => {
    const functions = [suspendFun('flush')];

    expect(findingsFor([cleanupCall('flush')], { functions })).toHaveLength(1);
    expect(
      findingsFor([cleanupCall('flush', { receiver: 'this', qualifier: 'this' })], { functions }),
    ).toHaveLength(1);
  });

  it('reports a top-level suspend function and a suspend function value', () => {
    expect(
      findingsFor([cleanupCall('flush', { owner: undefined })], {
        functions: [suspendFun('flush', { owner: '' })],
      }),
    ).toHaveLength(1);
    expect(findingsFor([cleanupCall('block', { calleeType: 'suspend()->Unit' })])).toHaveLength(1);
  });

  it('reports members of coroutine types it can see declared, including a call result', () => {
    expect(
      findingsFor(
        [
          cleanupCall('join', { receiver: 'name', qualifier: 'job', receiverType: 'Job' }),
          cleanupCall('await', {
            receiver: 'call',
            qualifier: 'scope.async { }',
            receiverType: 'call:async',
          }),
          cleanupCall('send', { receiver: 'name', qualifier: 'out', receiverType: 'Channel' }),
          cleanupCall('lock', { receiver: 'name', qualifier: 'gate', receiverType: 'call:Mutex' }),
        ],
        { imports: [COROUTINES, SYNC, CHANNELS] },
      ),
    ).toHaveLength(4);
  });

  it('reports extensions only with the import that names them', () => {
    const lock = cleanupCall('withLock', {
      receiver: 'name',
      qualifier: 'gate',
      receiverType: 'Mutex',
    });

    expect(findingsFor([lock], { imports: [SYNC] })).toHaveLength(1);
    expect(findingsFor([lock], { imports: [importOf('kotlin.concurrent.withLock')] })).toEqual([]);
    expect(
      findingsFor([cleanupCall('joinAll', { receiver: 'other', qualifier: 'jobs.map { it }' })]),
    ).toHaveLength(1);
  });

  it('follows import aliases and explicit imports', () => {
    const imports = [importOf('kotlinx.coroutines.delay', { alias: 'pause' })];

    expect(findingsFor([cleanupCall('pause')], { imports })).toHaveLength(1);
    expect(findingsFor([cleanupCall('delay')], { imports })).toEqual([]);
    expect(
      findingsFor([cleanupCall('delay')], { imports: [importOf('kotlinx.coroutines.delay')] }),
    ).toHaveLength(1);
  });

  it('reports a fully qualified kotlinx call', () => {
    expect(
      findingsFor([cleanupCall('delay', { receiver: 'other', qualifier: 'kotlinx.coroutines' })], {
        imports: [],
      }),
    ).toHaveLength(1);
  });

  it('numbers a repeated call in one function', () => {
    const findings = findingsFor([
      cleanupCall('delay', { line: 3 }),
      cleanupCall('delay', { line: 4 }),
    ]);

    expect(findings.map(({ identity }) => identity)).toEqual([
      'SuspendFunInFinallySection:Store.close:delay',
      'SuspendFunInFinallySection:Store.close:delay#2',
    ]);
  });

  it('words a CancellationException handler on its own and keeps the identity apart', () => {
    const findings = findingsFor([cleanupCall('delay', { section: 'catch' })]);

    expect(findings[0].message).toBe(
      sourceRouted(
        `This \`catch (CancellationException)\` block calls the suspending \`delay()\`, but the coroutine is already cancelled, so the call throws at once and the rest of the handler is skipped. Rethrow after non-suspending cleanup, or ${BOUNDED}`,
        SUSPEND_CLEANUP_RULE,
      ),
    );
    expect(findings[0].identity).toBe('SuspendFunInFinallySection:Store.close:catch:delay');
  });
});

describe('cleanup the rule leaves alone', () => {
  it.each([
    ['a call nothing models', cleanupCall('flush')],
    [
      'a blocking close',
      cleanupCall('close', { receiver: 'name', qualifier: 'reader', receiverType: 'Reader' }),
    ],
    [
      'Thread.join',
      cleanupCall('join', { receiver: 'name', qualifier: 'worker', receiverType: 'Thread' }),
    ],
    ['a join on an unknown receiver', cleanupCall('join', { receiver: 'name', qualifier: 'x' })],
    [
      'a join on a call result',
      cleanupCall('join', { receiver: 'call', receiverType: 'call:thread' }),
    ],
    ['withContext with a context it cannot read', cleanupCall('withContext', { context: 'ctx' })],
    ['withContext with no context', cleanupCall('withContext')],
    [
      'a call named like a kotlinx call on a receiver',
      cleanupCall('delay', { receiver: 'name', qualifier: 'timer', receiverType: 'Timer' }),
    ],
  ])('allows %s', (_name, call) => {
    expect(findingsFor([call])).toEqual([]);
  });

  it('allows names that are not imported from kotlinx.coroutines', () => {
    expect(findingsFor([cleanupCall('delay')], { imports: [] })).toEqual([]);
    expect(findingsFor([cleanupCall('delay')], { imports: [importOf('my.app.delay')] })).toEqual(
      [],
    );
  });

  it('allows a name the file declares itself without suspend, or declares both ways', () => {
    expect(
      findingsFor([cleanupCall('delay')], { functions: [fn('delay', { owner: 'Store' })] }),
    ).toEqual([]);
    expect(
      findingsFor([cleanupCall('flush')], {
        functions: [suspendFun('flush'), fn('flush', { owner: 'Store' })],
      }),
    ).toEqual([]);
  });

  it('allows a suspend function of an unrelated class and a local class member that is not suspend', () => {
    const other = klass('Other');

    expect(
      findingsFor([cleanupCall('flush')], {
        functions: [suspendFun('flush', { owner: 'Other' })],
        classes: [other],
      }),
    ).toEqual([]);
    expect(
      findingsFor(
        [cleanupCall('close', { receiver: 'name', qualifier: 'cache', receiverType: 'Cache' })],
        { classes: [klass('Cache')], functions: [fn('close', { owner: 'Cache' })] },
      ),
    ).toEqual([]);
  });

  it('reports a suspend member of a class declared in the file', () => {
    expect(
      findingsFor(
        [cleanupCall('close', { receiver: 'name', qualifier: 'cache', receiverType: 'Cache' })],
        { classes: [klass('Cache')], functions: [suspendFun('close', { owner: 'Cache' })] },
      ),
    ).toHaveLength(1);
  });

  it('reports a suspend member of a class declared in another file and skips ambiguous names', () => {
    const user = file({
      imports: [COROUTINES],
      cleanupCalls: [
        cleanupCall('close', { receiver: 'name', qualifier: 'cache', receiverType: 'Cache' }),
      ],
    });
    const declaring = (path) =>
      file({
        file: path,
        classes: [klass('Cache')],
        functions: [suspendFun('close', { owner: 'Cache' })],
      });

    expect(
      run(suspendCleanupFindings, [user], { declaredIn: [user, declaring('a/Cache.kt')] }),
    ).toHaveLength(1);
    expect(
      run(suspendCleanupFindings, [user], {
        declaredIn: [user, declaring('a/Cache.kt'), declaring('b/Cache.kt')],
      }),
    ).toEqual([]);
  });

  it('reads files without facts for the rule', () => {
    expect(run(suspendCleanupFindings, [file()])).toEqual([]);
  });
});

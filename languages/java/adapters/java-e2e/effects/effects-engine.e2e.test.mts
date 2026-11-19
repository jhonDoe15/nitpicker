import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runEngineOnSamples, type EngineReport } from '../test-support/views/effects-views.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';

function linesOf(report: EngineReport, rule: string, fileName: string): (number | string)[] {
  return report.violations
    .filter((violation) => violation.rule === rule && violation.fileName === fileName)
    .map((violation) =>
      violation.firstLine === violation.line
        ? violation.line
        : `${String(violation.firstLine)}-${String(violation.line)}`,
    );
}

function methodsOf(report: EngineReport, rule: string): string[] {
  return report.violations
    .filter((violation) => violation.rule === rule)
    .map((violation) => violation.method);
}

describe.skipIf(!enabled)('the effects engine on compiled samples', () => {
  let run: ReturnType<typeof runEngineOnSamples>;

  beforeAll(() => {
    run = runEngineOnSamples({ maven: process.env['NITPICKER_MAVEN'] });
  }, 120_000);

  afterAll(() => {
    rmSync(run.work, { recursive: true, force: true });
  });

  it('reads every sample class', () => {
    const { classes, skipped, unreadableLibraries, unresolved } = run.report;

    expect({
      classes,
      skipped,
      unreadableLibraries,
      missingParents: unresolved.supertypes,
    }).toEqual({
      classes: 70,
      skipped: 0,
      unreadableLibraries: 0,
      missingParents: 0,
    });
  });

  it('follows a helper that lives in another module of the same build', () => {
    expect(
      methodsOf(run.report, 'IoCallInLoop').filter((method) => method.startsWith('Modules.')),
    ).toEqual(['Modules.eachItem']);
    expect(
      run.report.violations.filter((violation) => violation.className === 'lib.Remote'),
    ).toEqual([]);
  });

  it('skips a method with too many loops and says so', () => {
    expect(methodsOf(run.report, 'IoCallInLoop')).not.toContain('Many.manyLoops');
    expect(run.report.degraded).toEqual({ oversizedMethods: 1, timeBudgetExceeded: false });
  });

  it('reports a call per element of every client kind in the table', () => {
    expect(
      methodsOf(run.report, 'IoCallInLoop').filter((method) => method.startsWith('Clients.')),
    ).toEqual([
      'Clients.retrofit',
      'Clients.jaxRs',
      'Clients.myBatis',
      'Clients.queryDsl',
      'Clients.neo4j',
      'Clients.cassandra',
      'Clients.elasticsearch',
    ]);
  });

  it('allows writes flushed in steps and lists accumulated then queried, and reports the rest', () => {
    expect(
      methodsOf(run.report, 'IoCallInLoop').filter((method) => method.startsWith('Batches.')),
    ).toEqual([
      'Batches.persistedEach',
      'Batches.freshListEachTime',
      'Batches.collectedFutures',
      'Batches.streamedFutures',
      'Batches.storedFutures',
    ]);
  });

  it('reports calls per element, including early exits, iteration callbacks and derived queries', () => {
    expect(linesOf(run.report, 'IoCallInLoop', 'Loops.java')).toEqual([
      22,
      30,
      38,
      45,
      73,
      78,
      84,
      90,
      91,
      97,
      '103-104',
    ]);
    const cached = run.report.violations.find((violation) => violation.line === 97);
    expect(cached).toEqual({
      rule: 'IoCallInLoop',
      className: 'shop.Loops',
      fileName: 'Loops.java',
      line: 97,
      firstLine: 97,
      method: 'Loops.cached',
      detail: 'Loops.cached|ValueOperations.get()',
      kind: 'database',
      form: 'loop',
      path: ['ValueOperations.get()'],
      store: 'redis',
    });
  });

  it('reports a find, a single-row query or an equals that reads per item, not references, containment, pages or id chunks', () => {
    expect(
      methodsOf(run.report, 'IoCallInLoop').filter((method) => /^(Paging|Tracked)\./u.test(method)),
    ).toEqual(['Paging.perIdQueries', 'Paging.lookups', 'Paging.singles', 'Paging.comparisons']);
  });

  it('treats once-per-class initialisation as one-off but keeps item, trailing and per-item memo I/O', () => {
    expect(
      methodsOf(run.report, 'IoCallInLoop').filter((method) => method.startsWith('Memos.')),
    ).toEqual([
      'Memos.relationOfItem',
      'Memos.afterTheMemo',
      'Memos.dirtyOr',
      'Memos.dirtyAnd',
      'Memos.afterInit',
      'Memos.keyedByItem',
    ]);
  });

  it('leaves paging, chunks and concurrent calls alone and records the exempt calls', () => {
    const methods = methodsOf(run.report, 'IoCallInLoop');
    const exempt = run.report.covered
      .filter((fact) => fact.fileName === 'Loops.java' && fact.verdict === 'exempt')
      .map((fact) => `${String(fact.line)} ${fact.kind} ${fact.form}`);

    expect(methods).not.toContain('Loops.pages');
    expect(methods).not.toContain('Loops.chunks');
    expect(methods).not.toContain('Loops.concurrent');
    expect(exempt.sort()).toEqual([
      '110 remote concurrent',
      '111 message concurrent',
      '113 message loop',
    ]);
  });

  it('reports remote calls under a lock unless the block fills state once or only tries the lock', () => {
    expect(methodsOf(run.report, 'RemoteCallUnderLock')).toEqual([
      'Locks.guardedByClosed',
      'Locks.guardedByArgument',
      'Locks.underSinglePermit',
    ]);
  });

  it('reports transactions held across a remote call, and skips detached and suspended work', () => {
    expect(methodsOf(run.report, 'RemoteCallInTransaction')).toEqual([
      'Scopes.confirm',
      'Scopes.manual',
    ]);
  });

  it('leaves the bodies of a transaction synchronization to run after the transaction', () => {
    expect(methodsOf(run.report, 'RemoteCallInTransaction')).not.toContain(
      'Hooks.afterTransaction',
    );
  });

  it('accepts an idempotency key from a helper, field or wrapper, and a breaker without retries', () => {
    expect(methodsOf(run.report, 'RetryWithoutIdempotency')).toEqual([
      'Writes.withoutKey',
      'Writes.withRetries',
    ]);
  });

  it('allows relays keyed on the rows they read, and reports a job that writes and publishes', () => {
    expect(methodsOf(run.report, 'DualWriteWithoutOutbox')).toEqual(['Writes.batchJob']);
  });

  it('reports copies on every step', () => {
    expect(methodsOf(run.report, 'AccumulatorCopyInLoop')).toEqual(['Copies.copiedEachStep']);
  });

  it.each([
    [
      'reports resolvers of a parent list that query once per parent, and leaves batch and root fields',
      'GraphqlFieldPerParent',
      [
        'Graphql.direct',
        'Graphql.throughHelper',
        'Graphql.price',
        'Graphql.federated',
        'Graphql.nested',
        'Graphql.withContext',
      ],
    ],
    [
      'reports lookups per element of an in-memory collection in a reactive pipeline',
      'ReactiveLookupPerElement',
      [
        'Reactive.byReference',
        'Reactive.byLambda',
        'Reactive.byHelper',
        'Reactive.fromArray',
        'Reactive.remote',
        'Reactive.limitedDatabase',
      ],
    ],
    [
      'reports rows loaded to be changed or deleted in memory, and skips lifecycle, other calls and other uses',
      'RowsChangedInMemory',
      [
        'Jobs.execute',
        'Updates.forEachThenSave',
        'Updates.loopThenSave',
        'Updates.dirtyChecking',
        'Updates.deleteAllRows',
        'Updates.deleteEach',
        'Updates.collectionTableUpdate',
      ],
    ],
    [
      'reports retries that resend an object read outside the retried scope',
      'RetryWithStaleObject',
      ['Stale.resend', 'Stale.captured', 'Stale.loop', 'Stale.loopBeforeLoop', 'Stale.annotated'],
    ],
    [
      'reports a check that decides a write unless a lock, a version column or another repository guards it',
      'CheckThenWriteWithoutLock',
      ['Races.reserve', 'Races.claim'],
    ],
  ])('%s', (_title, rule, methods) => {
    expect(methodsOf(run.report, rule)).toEqual(methods);
  });

  it('reports entities loaded for one column or for existence, and leaves computed, transient and reused loads', () => {
    expect(methodsOf(run.report, 'EntityLoadedForOneColumn')).toEqual([
      'Projected.emails',
      'Projected.lambdaEmails',
      'Projected.looped',
    ]);
    expect(
      methodsOf(run.report, 'EntityLoadedForExistence').filter((method) =>
        method.startsWith('Projected.'),
      ),
    ).toEqual([
      'Projected.taken',
      'Projected.exists',
      'Projected.named',
      'Projected.atLeastOne',
      'Projected.none',
    ]);
  });

  it('reports async methods that block and waits on a method that has a synchronous twin', () => {
    expect(methodsOf(run.report, 'AsyncMethodDoesBlockingWork')).toEqual([
      'Waits.guava',
      'Waits.completed',
    ]);
    expect(methodsOf(run.report, 'WaitOnAsyncTwin')).toEqual([
      'Waits.waits',
      'Waits.joins',
      'Waits.unchecked',
    ]);
  });

  it('reports a job that loops over items without isolating each one, and nothing else', () => {
    expect(
      run.report.violations
        .filter((violation) => violation.rule === 'JobLoopWithoutItemIsolation')
        .map((violation) => `${violation.method} ${violation.job ?? ''}`),
    ).toEqual([
      'Jobs.closeAll @Scheduled',
      'Jobs.closeUntilFailure @Scheduled',
      'Jobs.onBatch @KafkaListener',
      'Jobs.onMessages @SqsListener',
      'Jobs.execute Quartz Job',
    ]);
  });

  it('reports a read that skips the soft-delete filter most reads of the entity apply, and nothing else', () => {
    expect(
      run.report.violations
        .filter((violation) => violation.rule === 'SoftDeleteFilterMissing')
        .map(
          (violation) => `${violation.method} ${violation.entity ?? ''}.${violation.column ?? ''}`,
        ),
    ).toEqual(['Trash.leaked Parcel.deletedAt']);
  });

  it('reports a loop over soft-deletable items that skips the flag the other loops check, and nothing else', () => {
    expect(
      run.report.violations
        .filter((violation) => violation.rule === 'DeletedItemInMemory')
        .map(
          (violation) => `${violation.method} ${violation.entity ?? ''}.${violation.flag ?? ''}`,
        ),
    ).toEqual(['Rooms.unguarded Bed.deletedAt']);
  });

  it('reports a route handler without the authorization the other handlers declare, and nothing else', () => {
    expect(
      run.report.violations
        .filter((violation) => violation.rule === 'HandlerWithoutAuth')
        .map(
          (violation) =>
            `${violation.method} ${String(violation.declared)}/${String(violation.total)}`,
        ),
    ).toEqual(['Handlers.open 22/24', 'Handlers.composed 22/24']);
  });

  it('reports lazy access per element only', () => {
    expect(methodsOf(run.report, 'LazyRelationInLoop')).toEqual(['Lazy.names', 'Lazy.mapped']);
  });
});

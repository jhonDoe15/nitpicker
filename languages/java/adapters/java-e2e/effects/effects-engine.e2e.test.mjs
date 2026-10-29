import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runEngineOnSamples } from '../../effects/test-support/engine-samples.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';

function linesOf(report, rule, fileName) {
  return report.violations
    .filter((violation) => violation.rule === rule && violation.fileName === fileName)
    .map((violation) =>
      violation.firstLine === violation.line
        ? violation.line
        : `${String(violation.firstLine)}-${String(violation.line)}`,
    );
}

function methodsOf(report, rule) {
  return report.violations
    .filter((violation) => violation.rule === rule)
    .map((violation) => violation.method);
}

describe.skipIf(!enabled)('the effects engine on compiled samples', () => {
  let run;

  beforeAll(() => {
    run = runEngineOnSamples({ maven: process.env.NITPICKER_MAVEN });
  }, 120_000);

  afterAll(() => {
    if (run !== undefined) rmSync(run.work, { recursive: true, force: true });
  });

  it('reads every sample class', () => {
    const { classes, skipped, unreadableLibraries } = run.report;

    expect({ classes, skipped, unreadableLibraries }).toEqual({
      classes: 12,
      skipped: 0,
      unreadableLibraries: 0,
    });
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

  it('reports remote calls under a lock unless the block fills state once', () => {
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

  it('accepts an idempotency key from a helper, field or wrapper, and a breaker without retries', () => {
    expect(methodsOf(run.report, 'RetryWithoutIdempotency')).toEqual([
      'Writes.withoutKey',
      'Writes.withRetries',
    ]);
  });

  it('allows relays keyed on the rows they read, and reports a job that writes and publishes', () => {
    expect(methodsOf(run.report, 'DualWriteWithoutOutbox')).toEqual(['Writes.batchJob']);
  });

  it('reports copies on every step and lazy access per element only', () => {
    expect(methodsOf(run.report, 'AccumulatorCopyInLoop')).toEqual(['Copies.copiedEachStep']);
    expect(methodsOf(run.report, 'LazyRelationInLoop')).toEqual(['Lazy.names', 'Lazy.mapped']);
  });
});

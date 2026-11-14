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
    const { classes, skipped, unreadableLibraries, unresolved } = run.report;

    expect({
      classes,
      skipped,
      unreadableLibraries,
      missingParents: unresolved.supertypes,
    }).toEqual({
      classes: 11,
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
});

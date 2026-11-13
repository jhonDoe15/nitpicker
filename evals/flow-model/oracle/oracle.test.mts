import { describe, expect, it } from 'vitest';
import { analyzeSource } from '../analyze.mts';
import { FIXTURES, ORDER_CONTRACTS, ORDER_INPUTS, fixtureNamed } from '../fixtures/index.mts';
import type { Fixture } from '../fixtures/source.mts';
import { requiredFields } from '../../../scripts/json/fields.mts';
import { compareWithOracle } from './compare.mts';
import type { Comparison } from './compare.mts';
import { runOracle } from './oracle.mts';

const PAID_A = 'paid-before-publish|bus.publish|A';
const EXACT_FIELDS = [
  'mode',
  'agree',
  'exhausted',
  'uninjected',
  'violationsOnlyStatic',
  'violationsOnlyObserved',
  'tracesOnlyStatic',
  'tracesOnlyObserved',
];
const SUBSET_FIELDS = ['mode', 'agree', 'exhausted', 'violationsOnlyObserved'];

function optionsOf(fixture: Fixture, exploreUnknown = false) {
  return {
    file: fixture.file,
    text: fixture.source,
    entry: fixture.entry,
    contracts: ORDER_CONTRACTS,
    inputs: ORDER_INPUTS,
    exploreUnknown,
  };
}

function staticResult(fixture: Fixture) {
  return analyzeSource({ ...optionsOf(fixture), bounds: fixture.bounds }).result;
}

function picked(value: Comparison, fields: readonly string[]) {
  const record = requiredFields(value, 'comparison');
  return Object.fromEntries(fields.map((field) => [field, record[field]]));
}

function observedViolations(comparison: Comparison): readonly string[] {
  if (!('observedViolations' in comparison)) {
    throw new Error('the comparison was not run against the oracle');
  }
  return comparison.observedViolations;
}

function comparisonOf(fixture: Fixture) {
  const partial = fixture.expect.status === 'partial';
  return compareWithOracle(staticResult(fixture), runOracle(optionsOf(fixture, partial)));
}

const ASYNC_FIXTURES = new Set(['async-entry', 'async-helper']);
const SYNC_FIXTURES = FIXTURES.filter((fixture) => !ASYNC_FIXTURES.has(fixture.name));

describe('concrete oracle', () => {
  it.each(
    SYNC_FIXTURES.filter((fixture) => fixture.expect.status === 'complete').map((fixture) => [
      fixture.name,
      fixture,
    ]),
  )('%s: observed violations and traces equal the static result', (_name, fixture) => {
    expect(picked(comparisonOf(fixture), EXACT_FIELDS)).toEqual({
      mode: 'exact',
      agree: true,
      exhausted: false,
      uninjected: [],
      violationsOnlyStatic: [],
      violationsOnlyObserved: [],
      tracesOnlyStatic: [],
      tracesOnlyObserved: [],
    });
  });

  it.each(
    SYNC_FIXTURES.filter((fixture) => fixture.expect.status === 'partial').map((fixture) => [
      fixture.name,
      fixture,
    ]),
  )('%s: every observed violation is among the static violations', (_name, fixture) => {
    expect(picked(comparisonOf(fixture), SUBSET_FIELDS)).toEqual({
      mode: 'subset',
      agree: true,
      exhausted: false,
      violationsOnlyObserved: [],
    });
  });

  it('observes violations on partial fixtures, so the subset check is not vacuous', () => {
    const observed = SYNC_FIXTURES.filter((fixture) => fixture.expect.status === 'partial')
      .map((fixture) => ({
        name: fixture.name,
        violations: observedViolations(comparisonOf(fixture)),
      }))
      .filter(({ violations }) => violations.length > 0)
      .map(({ name, violations }) => [name, violations]);

    const unguarded = [
      'order-status|db.commit|A|cancelled|paid',
      'order-status|db.commit|A|paid|paid',
    ];

    expect(observed).toEqual([
      ['catch-destructuring', [PAID_A]],
      ['inherited-property', unguarded],
      ['rest-destructuring', [PAID_A]],
      ['deleted-field', ['order-status|db.commit|A|undefined|paid']],
      ['closure-effect', unguarded],
      ['comma-effect', unguarded],
      ['recursion', ['order-status|db.commit|A|paid|paid']],
      ['unknown-recovery', [PAID_A]],
    ]);
  });

  it.each([...ASYNC_FIXTURES])('declines %s instead of running async code', (name) => {
    const fixture = fixtureNamed(name);
    const oracle = runOracle(optionsOf(fixture, true));

    expect([oracle, compareWithOracle(staticResult(fixture), oracle)]).toEqual([
      { executions: [], exhausted: false, unsupported: 'async' },
      { mode: 'unsupported', agree: false, executions: 0, unsupported: 'async' },
    ]);
  });

  it('enumerates every input value and effect outcome, including both sides of an ambiguous commit', () => {
    const { executions } = runOracle(optionsOf(fixtureNamed('correct-ordering')));

    expect(
      executions.map((execution) => [execution.assignment['order.status'], execution.trace]),
    ).toEqual([
      ['pending', 'db.commit:success > bus.publish:success => return'],
      ['pending', 'db.commit:failure => throw'],
      ['pending', 'db.commit:ambiguous => throw'],
      ['pending', 'db.commit:ambiguous => throw'],
      ['pending', 'db.commit:success > bus.publish:failure => throw'],
      ['paid', ' => return'],
      ['cancelled', ' => return'],
    ]);
  });

  it('lets an import without a contract return or throw when exploring partial fixtures', () => {
    const fixture = fixtureNamed('unknown-helper');
    const pending = runOracle(optionsOf(fixture, true)).executions.filter(
      (execution) => execution.assignment['order.status'] === 'pending',
    );

    expect(pending.map((execution) => execution.trace)).toEqual([
      './audit#audit:unknown > db.commit:success > bus.publish:success => return',
      './audit#audit:unknown => throw',
      './audit#audit:unknown > db.commit:failure => throw',
      './audit#audit:unknown > db.commit:ambiguous => throw',
      './audit#audit:unknown > db.commit:ambiguous => throw',
      './audit#audit:unknown > db.commit:success > bus.publish:failure => throw',
    ]);
  });

  it('reports a disagreement when the static result does not describe the executed source', () => {
    const exact = compareWithOracle(
      staticResult(fixtureNamed('missing-commit')),
      runOracle(optionsOf(fixtureNamed('correct-ordering'))),
    );
    const subset = compareWithOracle(
      staticResult(fixtureNamed('amount-guard-undeclared')),
      runOracle(optionsOf(fixtureNamed('recursion'), true)),
    );

    expect([
      picked(exact, ['agree', 'violationsOnlyStatic', 'violationsOnlyObserved']),
      picked(subset, ['agree', 'violationsOnlyObserved']),
    ]).toEqual([
      {
        agree: false,
        violationsOnlyStatic: ['paid-before-publish|bus.publish|A'],
        violationsOnlyObserved: [],
      },
      { agree: false, violationsOnlyObserved: ['order-status|db.commit|A|paid|paid'] },
    ]);
  });

  it('stops at the execution limit and reports that the run was exhausted', () => {
    const fixture = fixtureNamed('joined-branches');
    const oracle = runOracle({ ...optionsOf(fixture), limit: 3 });

    expect([oracle.executions.length, oracle.exhausted]).toEqual([3, true]);
    expect(compareWithOracle(staticResult(fixture), oracle).agree).toEqual(false);
  });
});

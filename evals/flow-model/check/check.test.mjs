import { describe, expect, it } from 'vitest';
import { analyzeSource } from '../analyze.mjs';
import { labelMatches } from '../evaluate.mjs';
import { FIXTURES, ORDER_CONTRACTS, ORDER_INPUTS, fixtureNamed } from '../fixtures/index.mjs';
import { code } from '../fixtures/source.mjs';
import { canonicalJson } from '../report/canonical.mjs';
import { stepsOf } from '../report/view.mjs';

function analyzed(name, bounds) {
  const fixture = fixtureNamed(name);
  const options = { file: fixture.file, text: fixture.source, entry: fixture.entry };
  return analyzeSource({
    ...options,
    contracts: ORDER_CONTRACTS,
    inputs: ORDER_INPUTS,
    bounds: bounds ?? fixture.bounds,
  }).result;
}

function violation(result, signature) {
  return result.violations.find((item) => item.signature === signature);
}

describe('hand-labeled fixtures', () => {
  it.each(FIXTURES.map((fixture) => [fixture.name, fixture]))(
    '%s matches its label',
    (_name, fixture) => {
      const result = analyzed(fixture.name);

      expect({ status: result.status, labelMatch: labelMatches(result, fixture.expect) }).toEqual({
        status: fixture.expect.status,
        labelMatch: true,
      });
    },
  );

  it('never reports a partial fixture without the reason it is incomplete', () => {
    const partial = FIXTURES.map((fixture) => analyzed(fixture.name)).filter(
      (result) => result.status === 'partial',
    );

    expect(partial.length).toBeGreaterThan(0);
    expect(partial.every((result) => result.reasons.length > 0)).toBe(true);
  });
});

describe('path sensitivity', () => {
  it('keeps a commit on one branch from establishing it on the other', () => {
    const found = violation(analyzed('branch-only-commit'), 'paid-before-publish|bus.publish|A');

    expect(found.certainty).toBe('definite');
    expect(stepsOf(found.witness)).toEqual([
      'order.status !== "pending" is false (2:7)',
      'flag is false (5:7)',
    ]);
  });

  it('treats a caught commit failure as a failure path', () => {
    const found = violation(
      analyzed('caught-failure-publishes'),
      'paid-before-publish|bus.publish|A',
    );

    expect(stepsOf(found.witness)).toEqual([
      'order.status !== "pending" is false (2:7)',
      'db.commit(A to paid) failure (6:5)',
      'caught at 5:3',
    ]);
    expect(found).toMatchObject({ line: 10, column: 3 });
  });

  it('never treats an ambiguous commit as a definite no-write', () => {
    const found = violation(
      analyzed('ambiguous-compensation'),
      'order-status|db.commit|A|paid|cancelled',
    );

    expect(stepsOf(found.witness)).toContain('db.commit(A to paid) ambiguous (6:5)');
    expect(found.witness.events.some((event) => event.outcome === 'failure')).toBe(false);
  });

  it('widens facts after an unknown call and marks the resulting violations as possible', () => {
    const result = analyzed('unknown-helper');

    expect(result.status).toBe('partial');
    expect(result.reasons).toEqual([
      { reason: 'unknown-call', line: 7, column: 3, detail: 'audit' },
    ]);
    expect(result.violations.map((item) => item.certainty)).toEqual(['possible', 'possible']);
  });

  it('prunes branches whose guards contradict earlier decisions', () => {
    const result = analyzed('contradictory-guards');

    expect(result.violations).toEqual([]);
    expect(result.paths.map((path) => path.guards.map((guard) => guard.value))).toEqual([
      [true, false],
      [false],
    ]);
  });

  it('distinguishes entities by identity, not by the effect name', () => {
    expect(
      violation(analyzed('alias-wrong-entity'), 'paid-before-publish|bus.publish|B').witness.events,
    ).toEqual([
      expect.objectContaining({ callee: 'db.commit', entity: 'A', outcome: 'success', to: 'paid' }),
    ]);
  });
});

describe('bounds', () => {
  it('reports an exhausted state budget as partial, and completes with a larger budget', () => {
    const small = analyzed('exhausted-budget');
    const large = analyzed('exhausted-budget', { maxStates: 64 });

    expect(small.reasons.map((item) => item.reason)).toEqual(['state-budget']);
    expect(small.stats.states).toBeLessThanOrEqual(6);
    expect(large.status).toBe('complete');
  });

  it('stops at the call-depth bound instead of inlining further', () => {
    const text = code`
      function third(order, db) {
        db.commit(order, 'paid');
      }
      function second(order, db) {
        third(order, db);
      }
      export function payOrder(order, db) {
        second(order, db);
      }
    `;
    const options = {
      file: 'depth.ts',
      text,
      entry: 'payOrder',
      contracts: ORDER_CONTRACTS,
      inputs: ORDER_INPUTS,
    };

    expect(analyzeSource({ ...options, bounds: { maxDepth: 2 } }).result.reasons[0].reason).toBe(
      'call-depth',
    );
    expect(analyzeSource({ ...options, bounds: { maxDepth: 3 } }).result.status).toBe('complete');
  });

  it('produces the same result on every run', () => {
    expect(canonicalJson(analyzed('recursion'))).toBe(canonicalJson(analyzed('recursion')));
  });
});

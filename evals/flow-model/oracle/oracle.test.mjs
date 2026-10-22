import { describe, expect, it } from 'vitest';
import { analyzeSource } from '../analyze.mjs';
import { FIXTURES, ORDER_CONTRACTS, ORDER_INPUTS, fixtureNamed } from '../fixtures/index.mjs';
import { compareWithOracle } from './compare.mjs';
import { runOracle } from './oracle.mjs';

function optionsOf(fixture) {
  return {
    file: fixture.file,
    text: fixture.source,
    entry: fixture.entry,
    contracts: ORDER_CONTRACTS,
    inputs: ORDER_INPUTS,
  };
}

function staticResult(fixture) {
  return analyzeSource({ ...optionsOf(fixture), bounds: fixture.bounds }).result;
}

const ELIGIBLE = FIXTURES.filter(
  (fixture) => fixture.oracle && staticResult(fixture).status === 'complete',
);

describe('concrete oracle', () => {
  it.each(ELIGIBLE.map((fixture) => [fixture.name, fixture]))(
    '%s: observed violations and traces equal the static result',
    (_name, fixture) => {
      const comparison = compareWithOracle(staticResult(fixture), runOracle(optionsOf(fixture)));

      expect(comparison).toMatchObject({
        agree: true,
        violationsOnlyStatic: [],
        violationsOnlyObserved: [],
        tracesOnlyStatic: [],
        tracesOnlyObserved: [],
      });
    },
  );

  it('covers every complete fixture and no partial one', () => {
    const partial = FIXTURES.filter((fixture) => staticResult(fixture).status === 'partial');

    expect(ELIGIBLE.length + partial.length).toBe(FIXTURES.length);
    expect(partial.every((fixture) => !fixture.oracle)).toBe(true);
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

  it('reports a disagreement when the static result does not describe the executed source', () => {
    const comparison = compareWithOracle(
      staticResult(fixtureNamed('missing-commit')),
      runOracle(optionsOf(fixtureNamed('correct-ordering'))),
    );

    expect(comparison.agree).toBe(false);
    expect(comparison.violationsOnlyStatic).toEqual(['paid-before-publish|bus.publish|A']);
  });

  it('stops at the execution limit and reports that the run was exhausted', () => {
    const oracle = runOracle({ ...optionsOf(fixtureNamed('joined-branches')), limit: 3 });

    expect(oracle).toMatchObject({ exhausted: true });
    expect(compareWithOracle(staticResult(fixtureNamed('joined-branches')), oracle).agree).toBe(
      false,
    );
  });
});

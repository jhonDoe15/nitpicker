import { describe, expect, it } from 'vitest';
import {
  blendReports,
  ownCosts,
  weightsFromSeconds,
} from '../../../scripts/measure-shard-weights.mjs';
import { configuredAnalyzers } from './diff/configured-analyzers.mjs';

// These pin the relative ordering the measurements in docs/shard-weights.md established, never
// exact timings: re-measuring may move every number, but not the shape.
const weight = Object.fromEntries(
  configuredAnalyzers.map(({ name, shardWeight }) => [name, shardWeight]),
);

describe('shard weights', () => {
  it('gives every analyzer an explicit positive integer weight', () => {
    for (const { name, shardWeight } of configuredAnalyzers) {
      expect(Number.isInteger(shardWeight) && shardWeight > 0, name).toBe(true);
    }
  });

  it('ranks the test-running analyzers above the static ones', () => {
    expect(weight.mutation).toBeGreaterThan(weight.coverage);
    expect(weight.coverage).toBeGreaterThan(weight['eslint-errors']);
    for (const cheap of ['duplicates', 'structure', 'dead-code']) {
      expect(weight.coverage, cheap).toBeGreaterThan(weight[cheap]);
    }
    expect(Math.max(...Object.values(weight))).toBe(weight.mutation);
  });

  it('weights crap as the small step it adds on top of coverage', () => {
    expect(weight.crap).toBeLessThan(weight.coverage / 2);
  });

  it('weights the full lint above the focused lint checks', () => {
    for (const focused of ['eslint-errors', 'eslint-logging', 'eslint-module-effects']) {
      expect(weight['eslint-lint'], focused).toBeGreaterThan(weight[focused]);
    }
  });
});

describe('weight measurement helpers', () => {
  it('subtracts dependency time to get an analyzer own cost', () => {
    const analyzers = [{ name: 'coverage' }, { name: 'crap', dependencies: ['coverage'] }];
    expect(ownCosts(analyzers, { coverage: 10, crap: 12 })).toEqual({ coverage: 10, crap: 2 });
    expect(ownCosts(analyzers, { coverage: 10, crap: 9 })).toEqual({ coverage: 10, crap: 0 });
  });

  it('scales the heaviest to 100 and never rounds a weight to zero', () => {
    expect(weightsFromSeconds({ slow: 50, fast: 0.1, none: 0 })).toEqual({
      slow: 100,
      fast: 1,
      none: 1,
    });
  });

  it('blends fixtures by share of total so project size does not dominate', () => {
    const small = { costs: { slow: 3, fast: 1 } };
    const large = { costs: { slow: 300, fast: 100 } };
    expect(blendReports([small, large])).toEqual(blendReports([small]));
  });
});

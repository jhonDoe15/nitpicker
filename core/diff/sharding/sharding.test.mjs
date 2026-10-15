import { describe, expect, it } from 'vitest';
import { planAnalyzerShards, selectAnalyzerShard } from './sharding.mjs';

function analyzer(name, { dependencies = [], shardWeight = 1 } = {}) {
  return { name, dependencies, shardWeight };
}

describe('quality analyzer sharding', () => {
  it('keeps dependency components together and balances their measured weights', () => {
    const analyzers = [
      analyzer('largest', { shardWeight: 9 }),
      analyzer('coverage', { shardWeight: 6 }),
      analyzer('crap', { dependencies: ['coverage'], shardWeight: 2 }),
      analyzer('medium', { shardWeight: 5 }),
      analyzer('small', { shardWeight: 4 }),
    ];

    expect(planAnalyzerShards(analyzers, 3).map((shard) => shard.map(({ name }) => name))).toEqual([
      ['largest'],
      ['coverage', 'crap'],
      ['medium', 'small'],
    ]);
  });

  it('uses catalog order to make equal-weight plans deterministic', () => {
    const analyzers = ['a', 'b', 'c', 'd'].map((name) => analyzer(name));

    expect(planAnalyzerShards(analyzers, 2).map((shard) => shard.map(({ name }) => name))).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
  });

  it('selects one planned shard and validates its coordinates', () => {
    const analyzers = ['a', 'b', 'c'].map((name) => analyzer(name));

    expect(selectAnalyzerShard(analyzers, 2, 1).map(({ name }) => name)).toEqual(['b']);
    expect(() => selectAnalyzerShard(analyzers, 0, 0)).toThrow(/positive integer/);
    expect(() => selectAnalyzerShard(analyzers, 2, 2)).toThrow(/between 0 and 1/);
  });

  it('rejects invalid weights and unknown dependencies before planning', () => {
    expect(() => planAnalyzerShards([analyzer('invalid', { shardWeight: 0 })], 1)).toThrow(
      /shardWeight must be a positive number/,
    );
    expect(() =>
      planAnalyzerShards([analyzer('dependent', { dependencies: ['missing'] })], 1),
    ).toThrow(/requires unknown analyzer missing/);
  });
});

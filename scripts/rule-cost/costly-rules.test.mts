import { describe, expect, it } from 'vitest';
import { evenSample, ruleCosts, ruleTimes, unexpectedCosts } from './costly-rules.mts';

function passOf(rules: Readonly<Record<string, number>>) {
  return {
    stats: {
      times: {
        passes: [
          {
            rules: Object.fromEntries(
              Object.entries(rules).map(([rule, total]) => [rule, { total }]),
            ),
          },
        ],
      },
    },
  };
}

describe('the cost of each lint rule', () => {
  it('adds the time of a rule over every file and pass', () => {
    expect(ruleTimes([passOf({ a: 1, b: 2 }), passOf({ a: 3 }), {}])).toEqual([
      { rule: 'a', ms: 4 },
      { rule: 'b', ms: 2 },
    ]);
  });

  it('lists the slowest rule first and marks a rule that takes fifteen times the mean', () => {
    const cheap = Array.from({ length: 19 }, (_, index) => ({ rule: `r${String(index)}`, ms: 1 }));
    const costs = ruleCosts([...cheap, { rule: 'slow', ms: 381 }]);

    expect([costs[0], costs[1], unexpectedCosts(costs, new Set()).map(({ rule }) => rule)]).toEqual(
      [
        { rule: 'slow', ms: 381, timesMean: 19.05, costly: true },
        { rule: 'r0', ms: 1, timesMean: 0.05, costly: false },
        ['slow'],
      ],
    );
    expect(unexpectedCosts(costs, new Set(['slow']))).toEqual([]);
    expect(ruleCosts([])).toEqual([]);
  });

  it('samples evenly over the whole list', () => {
    const items = Array.from({ length: 10 }, (_, index) => index);

    expect([evenSample(items, 4), evenSample(items, 20), evenSample([], 3)]).toEqual([
      [0, 2, 5, 7],
      items,
      [],
    ]);
  });
});

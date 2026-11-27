import { describe, expect, it } from 'vitest';
import {
  appendAll,
  largest,
  lastOf,
  reachableFrom,
  sharedPrefixLength,
  smallest,
} from './lists.mts';

const MORE_THAN_A_CALL_TAKES = 300_000;

describe('list helpers that do not pass every item as a call argument', () => {
  it('append any number of items in order and return the target', () => {
    const target = [-1];
    const items = Array.from({ length: MORE_THAN_A_CALL_TAKES }, (_, index) => index);

    const appended = appendAll(target, items);

    expect(appended).toBe(target);
    expect(target).toHaveLength(MORE_THAN_A_CALL_TAKES + 1);
    expect(target.at(-1)).toBe(MORE_THAN_A_CALL_TAKES - 1);
  });

  it('find the largest and smallest of any number of values like Math.max and Math.min', () => {
    const values = Array.from({ length: MORE_THAN_A_CALL_TAKES }, (_, index) => index - 7);

    expect(largest(values)).toBe(MORE_THAN_A_CALL_TAKES - 8);
    expect(smallest(values)).toBe(-7);
    expect(largest([])).toBe(Math.max());
    expect(smallest([])).toBe(Math.min());
    expect(largest([1, Number.NaN])).toBeNaN();
  });

  it('count the leading items two lists share', () => {
    expect(sharedPrefixLength(['a', 'b', 'c'], ['a', 'b', 'd'])).toBe(2);
    expect(sharedPrefixLength(['a'], ['a', 'b'])).toBe(1);
    expect(sharedPrefixLength(['a', 'b'], ['a'])).toBe(1);
    expect(sharedPrefixLength([], ['a'])).toBe(0);
  });

  it('collect everything reachable from the start once, through cycles', () => {
    const edges = new Map([
      ['a', ['b']],
      ['b', ['c', 'a']],
      ['c', []],
      ['d', ['a']],
    ]);

    expect([...reachableFrom(['a'], (node) => edges.get(node) ?? [])]).toEqual(['a', 'b', 'c']);
  });

  it('take the last item, or the fallback when there is none', () => {
    expect(lastOf([1, 2, 3], 0)).toBe(3);
    expect(lastOf([], 7)).toBe(7);
  });
});

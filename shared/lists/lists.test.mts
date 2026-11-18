import { describe, expect, it } from 'vitest';
import { appendAll, largest, smallest } from './lists.mts';

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
});

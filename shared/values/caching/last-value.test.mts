import { describe, expect, it } from 'vitest';
import { lastValue } from './last-value.mts';

describe('lastValue', () => {
  it('computes once for a key asked several times in a row, and again after another key', () => {
    const created: string[] = [];
    const lengthOf = lastValue(
      (word: string) => word.toLowerCase(),
      (word) => {
        created.push(word);
        return { length: word.length };
      },
    );

    expect([
      lengthOf('first'),
      lengthOf('FIRST'),
      lengthOf('second'),
      lengthOf('first'),
      created,
    ]).toEqual([
      { length: 5 },
      { length: 5 },
      { length: 6 },
      { length: 5 },
      ['first', 'second', 'first'],
    ]);
  });
});

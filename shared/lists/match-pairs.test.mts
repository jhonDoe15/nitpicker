import { describe, expect, it } from 'vitest';
import { matchPairs } from './match-pairs.mts';

describe('matchPairs', () => {
  it('maps each match to the groups it names, and a group that did not match to empty text', () => {
    expect(matchPairs('a=1; b; c=3', /(\w+)(?:=(\d+))?/gu, { key: 1, value: 2 })).toEqual(
      new Map([
        ['a', '1'],
        ['b', ''],
        ['c', '3'],
      ]),
    );
    expect(matchPairs('=1', /(\w+)?=(\d)/gu, { key: 1, value: 2 })).toEqual(new Map([['', '1']]));
  });
});

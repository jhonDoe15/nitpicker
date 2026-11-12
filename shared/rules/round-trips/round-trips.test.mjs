import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROUND_TRIP_DIRECTIONS, roundTripPairs } from './round-trips.mjs';

const PYTHON_PAIRS = new URL(
  '../../../languages/python/rules/honesty/round_trips/pairs.py',
  import.meta.url,
);

function pythonDirections() {
  const text = readFileSync(PYTHON_PAIRS, 'utf8');
  const [, block] = /^DIRECTIONS = \(\n([\s\S]*?)\n\)$/mu.exec(text);
  return [...block.matchAll(/\("(\w+)", "(\w+)"\)/gu)].map(([, first, second]) => [first, second]);
}

function member(name, line) {
  return { name, line, isStatic: true };
}

describe('roundTripPairs', () => {
  it('uses the same direction words as the Python rule', () => {
    expect(pythonDirections()).toEqual(ROUND_TRIP_DIRECTIONS);
  });

  it('keeps the first definition of a half and skips toString and lone directions', () => {
    const pairs = roundTripPairs([
      member('encodeName', 1),
      member('encode_name', 2),
      member('decodeName', 3),
      member('toString', 4),
      member('fromString', 5),
      member('to', 6),
      member('from', 7),
    ]);

    expect(pairs.map(({ earlier, later }) => [earlier.line, later.line])).toEqual([[1, 3]]);
  });
});

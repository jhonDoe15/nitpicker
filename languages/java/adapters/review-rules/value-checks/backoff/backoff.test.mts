import { describe, expect, it } from 'vitest';
import { namesOf } from '../../test-support/check-runner.mts';
import { BACKOFF_CHECK } from './backoff.mjs';

const names = namesOf(BACKOFF_CHECK);

describe('BackoffShiftOverflow in Java', () => {
  it('reports a shift clamped only to the type width', () => {
    expect(
      names(
        [
          'long delay(long base, long max, int attempt) {',
          'return Math.min(Math.max(base * (1L << Math.min(attempt, 62)), 1), max); }',
        ].join(' '),
      ),
    ).toEqual(['attempt']);
  });

  it('reports an unbounded shift of a retry counter', () => {
    expect(names('long delay(long base, int retries) { return base * (1L << retries); }')).toEqual([
      'retries',
    ]);
    expect(names('long delay(long base, int retries) { return (1 << retries) * base; }')).toEqual([
      'retries',
    ]);
  });

  it('leaves a small cap, a comparison and unrelated shifts', () => {
    expect(
      names(
        [
          'long a(long base, int attempt) { return base * (1L << Math.min(attempt, 20)); }',
          'long b(long base, long max, int attempt) { if (attempt >= 63) { return max; }',
          'return base * (1L << attempt); }',
          'long c(long width, int bits) { return width * (1L << bits); }',
          'long d(long base) { return base * (1L << 4); }',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});

describe('BackoffShiftOverflow in Kotlin', () => {
  it('reports shl of an attempt count', () => {
    expect(
      names('fun delay(base: Long, attempt: Int): Long = base * (1L shl attempt)', {
        kotlin: true,
      }),
    ).toEqual(['attempt']);
  });
});

import { describe, expect, it } from 'vitest';
import { parseSource as untypedParse } from '../../max-value-sums/source-file.mjs';
import { BACKOFF_CHECK as untypedCheck } from './backoff.mjs';

type Found = { readonly line: number; readonly name: string };

const parseSource: (text: string, options: { file: string; kotlin: boolean }) => unknown =
  untypedParse;
const check: { find: (source: unknown) => Found[] } = untypedCheck;

function names(body: string, kotlin = false): string[] {
  return check
    .find(parseSource(`class A {\n${body}\n}\n`, { file: kotlin ? 'A.kt' : 'A.java', kotlin }))
    .map(({ name }) => name);
}

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
      names('fun delay(base: Long, attempt: Int): Long = base * (1L shl attempt)', true),
    ).toEqual(['attempt']);
  });
});

import { describe, expect, it } from 'vitest';
import { matchingClose } from './matching-close.mts';

describe('matchingClose', () => {
  it('finds the bracket that closes the one at the offset, past nested pairs', () => {
    const text = 'call(a(b), c) { if (x) { y(); } }';

    expect(matchingClose(text, 4)).toBe(12);
    expect(matchingClose(text, 14, '{}')).toBe(32);
    expect(matchingClose(text, 23, '{}')).toBe(30);
  });

  it('reports -1 for an unclosed bracket, a start that is no opening bracket or an unknown pair', () => {
    expect(matchingClose('f(a(b)', 1)).toBe(-1);
    expect(matchingClose('f(a)', 0)).toBe(-1);
    expect(matchingClose('f(a)', 1, '«»')).toBe(-1);
  });

  it('scans a large text in one pass', () => {
    const text = `{${'x'.repeat(2_000_000)}}`;

    expect(matchingClose(text, 0, '{}')).toBe(2_000_001);
  });
});

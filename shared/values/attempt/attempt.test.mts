import { describe, expect, it } from 'vitest';
import { attempt, valueOr } from './attempt.mts';

describe('attempt', () => {
  it('holds the value of a call that returns', () => {
    expect(attempt(() => 3)).toEqual({ ok: true, value: 3 });
  });

  it('holds the error of a call that throws', () => {
    const failure = new Error('no');

    expect(
      attempt(() => {
        throw failure;
      }),
    ).toEqual({
      ok: false,
      error: failure,
    });
  });
});

describe('valueOr', () => {
  it('falls back when the call throws', () => {
    expect(
      valueOr(() => {
        throw new Error('no');
      }, 'fallback'),
    ).toBe('fallback');
    expect(valueOr(() => 'value', 'fallback')).toBe('value');
  });
});

import { describe, expect, it } from 'vitest';
import {
  DISCRIMINANT_KEYS,
  IDIOMATIC_TEXTS,
  TRANSLATION_CALLS,
  isIdiomaticText,
} from './repeated-literal-exemptions.mjs';

describe('isIdiomaticText', () => {
  it.each([...IDIOMATIC_TEXTS, 'application/json', 'text/*', '%Y-%m-%d %H:%M', '%d/%m/%Y'])(
    'knows %s',
    (text) => {
      expect(isIdiomaticText(text)).toBe(true);
    },
  );

  it.each(['pending', '2024-01-01', 'get', 'application/'])('does not take %s for one', (text) => {
    expect(isIdiomaticText(text)).toBe(false);
  });
});

describe('exemption lists', () => {
  it('hold each entry once', () => {
    for (const list of [IDIOMATIC_TEXTS, TRANSLATION_CALLS, DISCRIMINANT_KEYS]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

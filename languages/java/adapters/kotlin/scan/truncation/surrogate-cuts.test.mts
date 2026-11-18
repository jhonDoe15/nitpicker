import { describe, expect, it } from 'vitest';
import { type Check, type Ruled, scanKotlinSource } from '../typed/typed-scan.mts';
import { surrogateSplittingCuts as untypedCuts } from './surrogate-cuts.mjs';

const surrogateSplittingCuts: Check<Ruled> = untypedCuts;

function found(body: string) {
  return surrogateSplittingCuts(
    scanKotlinSource(`fun shorten(text: String, max: Int): String {\n${body}\n}\n`),
  ).length;
}

describe('surrogateSplittingCuts', () => {
  it.each([
    [
      'take after a length check',
      '    return if (text.length > max) text.take(max - 1) + "…" else text',
    ],
    [
      'substring after a length check',
      '    if (text.length > max) {\n        return text.substring(0, max - 3) + "..."\n    }\n    return text',
    ],
    ['a constant bound', '    if (text.length >= 100) return text.take(100)\n    return text'],
    [
      'subSequence',
      '    if (text.length > max) return text.subSequence(0, max).toString()\n    return text',
    ],
  ])('reports %s', (_name, body) => {
    expect(found(body)).toBe(1);
  });

  it.each([
    ['no length check', '    return text.take(max)'],
    ['another bound', '    return if (text.length > 10) text.take(max) else text'],
    ['the first character', '    return if (text.length > max) text.take(1) else text'],
    [
      'a surrogate check',
      '    if (text.length > max) {\n        var end = max\n        if (Character.isHighSurrogate(text[end - 1])) end--\n        return text.substring(0, end)\n    }\n    return text',
    ],
    ['an ascii name', '    return if (hash.length > max) hash.take(max) else hash'],
    ['a different receiver', '    return if (text.length > max) other.take(max) else text'],
    ['a comment', '    // if (text.length > max) text.take(max)\n    return text'],
  ])('leaves %s alone', (_name, body) => {
    expect(found(body)).toBe(0);
  });
});

import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { applySuggestions } from './apply-suggestions.mts';
import { lintCases } from './test-support/lint-cases.mts';
import type { LintMessage } from './typed/suggestion-views.mts';

const LITERALS = [
  String.raw`'a\.b'`,
  String.raw`"say \'hi\'"`,
  String.raw`'\#\%\&'`,
  String.raw`'smile \😀'`,
  '`cost \\$5`',
  '`\\a b`',
  String.raw`/[\.]/u`,
  String.raw`/\#tag/`,
  String.raw`/[\.]/v`,
  String.raw`/\:x/`,
];

const QUANTIFIER_LIKE = [String.raw`/a{1\,2}/`, String.raw`/a{2\,}/`];

const SAMPLES = ['a.b', 'a-b', '#tag', ':x', '$5', 'x'];

let linted: Map<string, readonly LintMessage[]>;

function escapesIn(literal: string): number {
  return literal.split('\\').length - 1;
}

function moduleOf(literal: string): string {
  return `export const value = ${literal};\n`;
}

function valueOf(source: string): unknown {
  const literal = source.slice('export const value = '.length, -';\n'.length);
  return runInNewContext(
    `(() => {
      const value = (${literal});
      return value instanceof RegExp
        ? { flags: value.flags, matches: samples.map((sample) => value.test(sample)) }
        : value;
    })()`,
    { samples: SAMPLES },
  );
}

beforeAll(async () => {
  linted = await lintCases(
    Object.fromEntries(
      [...LITERALS, ...QUANTIFIER_LIKE].map((literal) => [literal, moduleOf(literal)]),
    ),
  );
});

describe('the no-useless-escape suggestion that removes the backslash', () => {
  it.each(LITERALS)('keeps the value of %s', (literal) => {
    const text = moduleOf(literal);
    const messages = (linted.get(literal) ?? []).filter(
      ({ ruleId }) => ruleId === 'no-useless-escape',
    );
    const fixed = applySuggestions({ text, messages });

    expect(messages).toHaveLength(escapesIn(literal));
    expect(fixed.text).not.toBe(text);
    expect(valueOf(fixed.text)).toEqual(valueOf(text));
  });

  it.each(QUANTIFIER_LIKE)(
    'leaves %s, where the bare character would make a quantifier',
    (literal) => {
      const text = moduleOf(literal);
      const messages = (linted.get(literal) ?? []).filter(
        ({ ruleId }) => ruleId === 'no-useless-escape',
      );

      expect(messages).toHaveLength(escapesIn(literal));
      expect(applySuggestions({ text, messages }).text).toBe(text);
    },
  );
});

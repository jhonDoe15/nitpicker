import { beforeAll, describe, expect, it } from 'vitest';
import cases from './fixtures/suggestion-cases.json' with { type: 'json' };
import { applySuggestions } from './apply-suggestions.mjs';
import { isRuleSelected, suggestionName, suggestionRules } from './suggestion-rules.mjs';
import { lintCases } from './test-support/lint-cases.mjs';

const expected = {
  'no-case-declarations':
    'export function pick(x: number): number {\n  switch (x) {\n    case 1:\n      { const y = 1;\n      return y; }\n    default:\n      return 0;\n  }\n}\n',
  'no-prototype-builtins':
    "export function has(o: object): boolean {\n  return Object.prototype.hasOwnProperty.call(o, 'a');\n}\n",
  'no-compare-neg-zero': 'export function zero(x: number): boolean {\n  return x == 0;\n}\n',
  '@typescript-eslint/no-unnecessary-type-constraint':
    'export function keep<T>(a: T): T {\n  return a;\n}\n',
  '@typescript-eslint/no-useless-constructor': 'export class Plain {\n  \n}\n',
  '@typescript-eslint/no-non-null-asserted-nullish-coalescing':
    "declare function read(): string | undefined;\n\nexport function pick(): string {\n  const a = read();\n  return a ?? 'x';\n}\n",
  '@typescript-eslint/no-non-null-asserted-optional-chain':
    'export function name(a?: { b: string }): string {\n  return a?.b;\n}\n',
  'no-unused-private-class-members': 'export class Holder {\n}\n',
  'use-isnan': 'export function bad(x: number): boolean {\n  return Number.isNaN(x);\n}\n',
  'preserve-caught-error':
    "export function wrap(): number {\n  try {\n    return 1;\n  } catch (error) {\n    throw new Error('failed', { cause: error });\n  }\n}\n",
  '@typescript-eslint/require-await': 'export function one(): number {\n  return 1;\n}\n',
  '@typescript-eslint/await-thenable':
    'export async function wait(a: number): Promise<number> {\n  return  a;\n}\n',
  '@typescript-eslint/ban-ts-comment':
    'export function cast(): string {\n  // @ts-expect-error\n  return 1 as string;\n}\n',
  '@typescript-eslint/no-array-delete':
    'export function drop(items: number[]): void {\n  items.splice(0, 1);\n}\n',
  '@typescript-eslint/use-unknown-in-catch-callback-variable':
    'export function recover(p: Promise<number>): Promise<number> {\n  return p.catch((e: unknown) => 0);\n}\n',
  '@typescript-eslint/switch-exhaustiveness-check':
    "type Mode = 'a' | 'b';\n\nexport function label(m: Mode): number {\n  switch (m) {\n    case 'a':\n      return 1;\n    case \"b\": { throw new Error('Not implemented yet: \"b\" case') }\n  }\n  return 0;\n}\n",
};

const everything = Object.keys(suggestionRules).map(suggestionName);

let linted;

beforeAll(async () => {
  linted = await lintCases(cases);
});

function suggest(name, selectedRules = []) {
  return applySuggestions({ text: cases[name], messages: linted.get(name), selectedRules });
}

describe('applySuggestions with the rules ESLint reports', () => {
  it('covers every allowlisted rule', () => {
    expect(Object.keys(expected).toSorted()).toEqual(Object.keys(suggestionRules).toSorted());
  });

  it.each(Object.keys(expected))('turns the %s fixture into the allowed form', (rule) => {
    const { text, applied } = suggest(rule, everything);

    expect(text).toBe(expected[rule]);
    expect(applied).toEqual([{ rule: suggestionName(rule), line: expect.any(Number) }]);
  });

  it.each(Object.keys(expected).filter((rule) => suggestionRules[rule] === 'safe'))(
    'applies the safe rule %s without a selection',
    (rule) => {
      expect(suggest(rule).text).toBe(expected[rule]);
    },
  );

  it.each(Object.keys(expected).filter((rule) => suggestionRules[rule] === 'review'))(
    'leaves the review rule %s alone unless it is selected',
    (rule) => {
      expect(suggest(rule).text).toBe(cases[rule]);
      expect(suggest(rule, [suggestionName('use-isnan')]).text).toBe(
        rule === 'use-isnan' ? expected[rule] : cases[rule],
      );
      expect(suggest(rule, [suggestionName(rule)]).text).toBe(expected[rule]);
    },
  );

  it('leaves a rule that offers two suggestions alone', () => {
    const messages = linted.get('two-suggestions');

    expect(messages.map(({ ruleId, suggestions }) => [ruleId, suggestions.length])).toEqual([
      ['no-compare-neg-zero', 2],
    ]);
    expect(suggest('two-suggestions', everything)).toEqual({
      text: cases['two-suggestions'],
      applied: [],
    });
  });
});

describe('applySuggestions on reported messages', () => {
  const suggestion = (range, text) => ({ fix: { range, text } });
  const message = (ruleId, suggestions, extra = {}) => ({ ruleId, line: 1, suggestions, ...extra });

  it('ignores a rule that is not on the allowlist, even with one suggestion', () => {
    const messages = [message('no-empty', [suggestion([0, 1], 'x')])];

    expect(
      applySuggestions({ text: 'abc', messages, selectedRules: ['eslint-lint/no-empty'] }).text,
    ).toBe('abc');
  });

  it('ignores a message that has an autofix or no suggestion', () => {
    const messages = [
      message('no-prototype-builtins', [suggestion([0, 1], 'x')], {
        fix: { range: [0, 1], text: 'y' },
      }),
      message('no-prototype-builtins', []),
      message('no-prototype-builtins', undefined),
    ];

    expect(applySuggestions({ text: 'abc', messages }).text).toBe('abc');
  });

  it('skips the later of two overlapping edits and keeps the file offsets', () => {
    const messages = [
      message('no-prototype-builtins', [suggestion([2, 3], 'Z')]),
      message('no-prototype-builtins', [suggestion([0, 2], 'Y')]),
      message('no-prototype-builtins', [suggestion([1, 3], 'W')]),
    ];

    expect(applySuggestions({ text: 'abcd', messages }).text).toBe('YZd');
  });

  it('keeps a byte order mark and counts offsets after it', () => {
    const messages = [message('no-prototype-builtins', [suggestion([1, 2], 'X')])];

    expect(applySuggestions({ text: '﻿abc', messages }).text).toBe('﻿aXc');
  });

  it('ignores a range outside the text', () => {
    const messages = [message('no-prototype-builtins', [suggestion([5, 9], 'X')])];

    expect(applySuggestions({ text: 'abc', messages }).text).toBe('abc');
  });
});

describe('isRuleSelected', () => {
  it('takes the safe rules by default and only the named rules when some are selected', () => {
    expect(isRuleSelected('no-prototype-builtins', [])).toBe(true);
    expect(isRuleSelected('use-isnan', [])).toBe(false);
    expect(isRuleSelected('no-prototype-builtins', [suggestionName('use-isnan')])).toBe(false);
    expect(isRuleSelected('use-isnan', [suggestionName('use-isnan')])).toBe(true);
    expect(isRuleSelected('no-empty', [suggestionName('no-empty')])).toBe(false);
  });
});

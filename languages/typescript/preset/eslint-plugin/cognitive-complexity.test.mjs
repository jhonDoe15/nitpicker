import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as cognitiveComplexity } from './rules/analysis/cognitive-complexity.mjs';

RuleTester.afterAll = afterAll;

RuleTester.afterEach = afterEach;

RuleTester.beforeAll = beforeAll;

RuleTester.beforeEach = beforeEach;

RuleTester.describe = describe;

RuleTester.it = it;

RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});

const complexityOf = (value) => [{ messageId: 'tooComplex', data: { value, max: '0' } }];
ruleTester.run('cognitive-complexity', cognitiveComplexity, {
  valid: [
    { code: 'function plain(a: number) { return a + 1; }', options: [0] },
    { code: 'function one(a: boolean) { if (a) { return 1; } return 2; }', options: [1] },
    { code: 'const top = flag ? 1 : 2;', options: [0] },
    {
      code: 'function fallback(a?: string, b?: string) { return a ?? b ?? "none"; }',
      options: [0],
    },
    {
      code: 'function outer(items: readonly number[]) { return items.map((item) => item + 1); }',
      options: [0],
    },
  ],
  invalid: [
    {
      code: 'function chained(a: boolean, b: boolean) { if (a) { return 1; } else if (b ? a : b) { return 2; } return 0; }',
      options: [0],
      errors: complexityOf('3'),
    },
    {
      code: 'function within(a: boolean, b: boolean) { if (a) { return 1; } else if (b) { return a ? 2 : 3; } return 0; }',
      options: [0],
      errors: complexityOf('4'),
    },
    {
      code: [
        'function sumOfPrimes(max: number) {',
        '  let total = 0;',
        '  OUT: for (let i = 1; i <= max; ++i) {',
        '    for (let j = 2; j < i; ++j) {',
        '      if (i % j === 0) {',
        '        continue OUT;',
        '      }',
        '    }',
        '    total += i;',
        '  }',
        '  return total;',
        '}',
      ].join('\n'),
      options: [0],
      errors: complexityOf('7'),
    },
    {
      code: "function word(n: number) { switch (n) { case 1: return 'one'; default: return 'many'; } }",
      options: [0],
      errors: complexityOf('1'),
    },
    {
      code: 'function chain(a: boolean, b: boolean, c: boolean) { return a && b && c; }',
      options: [0],
      errors: complexityOf('1'),
    },
    {
      code: 'function mixed(a: boolean, b: boolean, c: boolean, d: boolean) { return (a && b) || (c && d); }',
      options: [0],
      errors: complexityOf('3'),
    },
    {
      code: 'function pick(a: number) { if (a > 2) { return 3; } else if (a > 1) { return 2; } else { return 1; } }',
      options: [0],
      errors: complexityOf('3'),
    },
    {
      code: 'function nested(a: boolean, b: boolean) { if (a) { if (b) { return 1; } } return 0; }',
      options: [0],
      errors: complexityOf('3'),
    },
    {
      code: 'function signs(items: readonly number[]) { return items.map((item) => (item > 0 ? 1 : -1)); }',
      options: [0],
      errors: complexityOf('1'),
    },
    {
      code: 'function guarded(run: () => number, a: boolean) { try { return run(); } catch { if (a) { return 1; } return 0; } }',
      options: [0],
      errors: complexityOf('3'),
    },
    {
      code: 'export const signOf = (n: number) => (n > 0 ? 1 : -1);',
      options: [0],
      errors: [{ messageId: 'tooComplex', line: 1, column: 35 }],
    },
    {
      code: 'function wide(a: boolean) { if (a) { return 1; } return 0; }',
      options: [0],
      errors: [{ messageId: 'tooComplex', line: 1, column: 10, data: { value: '1', max: '0' } }],
    },
  ],
});

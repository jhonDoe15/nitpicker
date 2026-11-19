import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { rule } from './naming-convention.mts';
import { ruleModule, typescriptRuleTester } from '../../test-support/rule-tester.mts';

const OPTIONS = [
  { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
  { selector: 'parameter', format: ['camelCase'] },
];

function pick(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

function lintWithoutParserServices(code: string) {
  const linter = new Linter({ configType: 'flat' });
  return linter
    .verify(code, [
      {
        plugins: { nitpicker: { rules: { 'naming-convention': ruleModule(rule) } } },
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        rules: { 'nitpicker/naming-convention': ['error', ...OPTIONS] },
      },
    ])
    .map(({ ruleId, message }) => `${String(ruleId)}: ${message}`);
}

describe('nitpicker/naming-convention without type information', () => {
  it('is not routed to the type-aware lint', () => {
    const wrapped: unknown = rule;

    expect(pick(pick(pick(wrapped, 'meta'), 'docs'), 'requiresTypeChecking')).toBe(false);
  });

  it('checks names when the parser gives no TypeScript services', () => {
    expect(
      lintWithoutParserServices(
        "import { z } from 'zod';\nexport const total_count = 1;\nexport const Order = z.object({});\n",
      ),
    ).toEqual([
      'nitpicker/naming-convention: Variable name `total_count` must match one of the following formats: camelCase, UPPER_CASE',
    ]);
  });
});

typescriptRuleTester().run('nitpicker/naming-convention next to import-equals', rule, {
  valid: [
    {
      code: "import fs = require('node:fs'); export const total = fs;",
      options: OPTIONS,
    },
  ],
  invalid: [
    {
      code: "import z = require('zod'); export const Order = z.object({});",
      options: OPTIONS,
      errors: [{ messageId: 'doesNotMatchFormat' }],
    },
  ],
});

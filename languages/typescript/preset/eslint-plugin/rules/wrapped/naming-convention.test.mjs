import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { rule } from './naming-convention.mjs';

const OPTIONS = [
  { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
  { selector: 'parameter', format: ['camelCase'] },
];

function lintWithoutParserServices(code) {
  const linter = new Linter({ configType: 'flat' });
  return linter
    .verify(code, [
      {
        plugins: { nitpicker: { rules: { 'naming-convention': rule } } },
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        rules: { 'nitpicker/naming-convention': ['error', ...OPTIONS] },
      },
    ])
    .map(({ ruleId, message }) => `${ruleId}: ${message}`);
}

describe('nitpicker/naming-convention without type information', () => {
  it('is not routed to the type-aware lint', () => {
    expect(rule.meta.docs.requiresTypeChecking).toBe(false);
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

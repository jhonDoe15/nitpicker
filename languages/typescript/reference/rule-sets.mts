import eslint from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import tseslint from 'typescript-eslint';

export type RuleSet = { readonly id: string; readonly rules: ReadonlySet<string> };

export function ruleSets(): RuleSet[] {
  return [
    { id: 'recommended', rules: new Set(Object.keys(eslint.configs.recommended.rules)) },
    {
      id: 'strict',
      rules: new Set(
        tseslint.configs.strictTypeChecked.flatMap((config) => Object.keys(config.rules ?? {})),
      ),
    },
    { id: 'vitest', rules: new Set(Object.keys(vitest.configs.recommended.rules)) },
  ];
}

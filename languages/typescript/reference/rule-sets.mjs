import eslint from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import tseslint from 'typescript-eslint';

/** The rule sets the presets enable as a whole, in the order that names the first one a rule is in. */
export function ruleSets() {
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

import globals from 'globals';
import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';

const ignores = [
  'src/main/**/__tests__/**',
  'src/main/**/*.test.ts',
  'src/main/**/*.spec.ts',
  '**/dist/**',
  '**/build/**',
  '**/generated/**',
  'src/main/**/*.d.ts',
  'node_modules/**',
  'coverage/**',
  'reports/**',
  'target/**',
  '.stryker-tmp/**',
];

export function productionPolicyConfig(rules) {
  return tseslint.config(
    { ignores },
    {
      files: ['src/main/**/*.ts'],
      languageOptions: {
        globals: globals.node,
        parser: tseslint.parser,
      },
      plugins: {
        nitpicker: nitpickerRules,
      },
      rules,
    },
  );
}

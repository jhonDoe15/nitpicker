import tseslint from 'typescript-eslint';

export default [
  {
    files: ['core/snapshot/fixtures/eslint-fixture-source.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: { 'no-debugger': 'error' },
  },
];

import type { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
export function nestScopeConfigFor(files: string[]): Linter.Config[] {
  return [
    {
      files,
      plugins: { '@typescript-eslint': tseslint.plugin },
      rules: { '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }] },
    },
  ];
}

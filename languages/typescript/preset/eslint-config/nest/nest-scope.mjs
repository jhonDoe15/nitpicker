import tseslint from 'typescript-eslint';
export function nestScopeConfigFor(files) {
  return [
    {
      files,
      plugins: { '@typescript-eslint': tseslint.plugin },
      rules: { '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }] },
    },
  ];
}

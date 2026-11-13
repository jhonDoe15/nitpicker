import { checksJavascript } from '../../modules/tsconfig-files.mjs';

export const UNSAFE_ANY_RULES = [
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-unsafe-return',
  '@typescript-eslint/restrict-template-expressions',
  '@typescript-eslint/restrict-plus-operands',
];

const JAVASCRIPT_FILES = ['**/*.{js,mjs,cjs,jsx}'];

export function untypedJavascriptConfig({ tsconfigFile, layout }) {
  if (layout.javascript || checksJavascript(tsconfigFile)) {
    return [];
  }
  return [
    {
      files: JAVASCRIPT_FILES,
      rules: Object.fromEntries(UNSAFE_ANY_RULES.map((rule) => [rule, 'off'])),
    },
  ];
}

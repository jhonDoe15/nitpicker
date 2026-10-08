import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { sourceGlobs, testGlobs, excludedGlobs } from '../layout.mjs';
import {
  escapeHatchLinterOptions,
  escapeHatchRules,
  escapeHatchSelectors,
} from './strict-escape-hatches.mjs';
import {
  configFileGlobs,
  declarationRules,
  declarationSelectors,
  defaultExportSelectors,
  typedDeclarationRules,
} from './strict-declarations.mjs';

// `no-restricted-syntax` is replaced, not merged, so every strict selector is listed here once.
const everywhereSelectors = [...escapeHatchSelectors, ...declarationSelectors];
const notInConfigFileSelectors = [...defaultExportSelectors];

// Rules that need only the syntax tree. This is the default export and runs without a TypeScript
// program. It is not the default preset; the preset enables it explicitly.
const strictSyntaxConfig = [
  { ignores: excludedGlobs },
  {
    files: sourceGlobs,
    ignores: testGlobs,
    languageOptions: { parser: tseslint.parser },
    linterOptions: escapeHatchLinterOptions,
    plugins: { nitpicker: nitpickerRules, '@typescript-eslint': tseslint.plugin },
    rules: {
      ...escapeHatchRules,
      ...declarationRules,
      'no-restricted-syntax': ['error', ...everywhereSelectors, ...notInConfigFileSelectors],
    },
  },
  {
    files: configFileGlobs,
    rules: { 'no-restricted-syntax': ['error', ...everywhereSelectors] },
  },
];

export default strictSyntaxConfig;

// Rules that need type information. `parserOptions` is how typescript-eslint finds the program,
// for example `{ project: './tsconfig.quality.json', tsconfigRootDir }`.
export function strictTypedConfig(parserOptions) {
  return [
    {
      files: sourceGlobs,
      ignores: testGlobs,
      languageOptions: { parser: tseslint.parser, parserOptions },
      plugins: { '@typescript-eslint': tseslint.plugin },
      rules: typedDeclarationRules,
    },
  ];
}

export function strictConfig(parserOptions) {
  return [...strictSyntaxConfig, ...strictTypedConfig(parserOptions)];
}

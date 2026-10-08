import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { sourceGlobs, testGlobs, excludedGlobs } from '../layout.mjs';
import {
  escapeHatchLinterOptions,
  escapeHatchRules,
  escapeHatchSelectors,
} from './strict-escape-hatches.mjs';

// `no-restricted-syntax` is replaced, not merged, so every strict selector is listed here once.
export const strictRestrictedSyntax = [...escapeHatchSelectors];

// The strict rule set. It is not the default preset; the preset enables it explicitly.
export default [
  { ignores: excludedGlobs },
  {
    files: sourceGlobs,
    ignores: testGlobs,
    languageOptions: { parser: tseslint.parser },
    linterOptions: escapeHatchLinterOptions,
    plugins: { nitpicker: nitpickerRules },
    rules: {
      ...escapeHatchRules,
      'no-restricted-syntax': ['error', ...strictRestrictedSyntax],
    },
  },
];

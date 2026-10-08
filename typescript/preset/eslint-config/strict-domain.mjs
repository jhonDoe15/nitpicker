import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { codeExtensions, excludedGlobs } from '../layout.mjs';

export const domainGlobs = [`src/main/features/*/domain/**/*.${codeExtensions}`];

// Strict rule set for `features/<name>/domain/`. The preset enables it; it is not in the default
// preset yet.
export default [
  { ignores: excludedGlobs },
  {
    files: domainGlobs,
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules },
    rules: {
      'nitpicker/no-self-recursion': 'error',
      'nitpicker/no-throw': 'error',
    },
  },
];

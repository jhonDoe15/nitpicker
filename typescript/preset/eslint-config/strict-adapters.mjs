import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { codeExtensions, excludedGlobs } from '../layout.mjs';

export const adapterGlobs = [`src/main/features/*/adapters/**/*.${codeExtensions}`];

// Zod is a documented expectation of the preset, not a dependency of nitpicker: the rule works on
// syntax and its messages name the zod schema as the allowed form.
export default [
  { ignores: excludedGlobs },
  {
    files: adapterGlobs,
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules },
    rules: {
      'nitpicker/no-handwritten-boundary-guard': 'error',
    },
  },
];

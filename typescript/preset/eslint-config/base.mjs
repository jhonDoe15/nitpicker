import globals from 'globals';
import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { sourceGlobs, testGlobs, excludedGlobs } from '../layout.mjs';

const ignores = [...excludedGlobs, 'src/**/__tests__/**', ...testGlobs, '.stryker-tmp/**'];

export function productionPolicyConfig(rules) {
  return tseslint.config(
    { ignores },
    {
      files: sourceGlobs,
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

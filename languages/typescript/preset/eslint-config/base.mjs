import globals from 'globals';
import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { readLayout } from '../head-policy.mjs';

const { sourceGlobs, testGlobs, excludedGlobs, sourceTestDirectoryGlobs } = readLayout();
const ignores = [...excludedGlobs, ...sourceTestDirectoryGlobs, ...testGlobs, '.stryker-tmp/**'];

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

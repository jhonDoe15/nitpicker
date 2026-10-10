import globals from 'globals';
import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { readLayout } from '../head-policy.mjs';

const { sourceGlobs, testGlobs, excludedGlobs, sourceTestDirectoryGlobs, entryPoints } =
  readLayout();
const ignores = [...excludedGlobs, ...sourceTestDirectoryGlobs, ...testGlobs, '.stryker-tmp/**'];
const entryPointScripts =
  entryPoints.length > 0
    ? [{ files: entryPoints, rules: { 'nitpicker/report-module-load-effects': 'off' } }]
    : [];

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
    ...entryPointScripts,
  );
}

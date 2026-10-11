import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { applyJavascriptDialect } from '../../../javascript/preset/eslint-dialect.mjs';
import { applyMatchingRuleExceptions } from './exceptions.mjs';

const { sourceGlobs, testGlobs, excludedGlobs, sourceTestDirectoryGlobs, entryPoints } =
  readLayout();
const ignores = [...excludedGlobs, ...sourceTestDirectoryGlobs, ...testGlobs, '.stryker-tmp/**'];
const entryPointScripts =
  entryPoints.length > 0
    ? [{ files: entryPoints, rules: { 'nitpicker/report-module-load-effects': 'off' } }]
    : [];

export function productionPolicyConfig(rules) {
  const config = defineConfig(
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
  const policy = readHeadPolicy();
  return applyMatchingRuleExceptions(applyJavascriptDialect(config, policy), policy.exceptions);
}

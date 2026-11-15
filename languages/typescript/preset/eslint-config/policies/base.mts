import type { Linter } from 'eslint';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import {
  applyJavascriptDialect,
  applyMatchingRuleExceptions,
  readHeadPolicy,
  readLayout,
} from '../typed/policy-views.mts';
import { linterConfigs } from '../typed/config-types.mts';

const { sourceGlobs, testGlobs, excludedGlobs, sourceTestDirectoryGlobs, entryPoints } =
  readLayout();
const ignores = [...excludedGlobs, ...sourceTestDirectoryGlobs, ...testGlobs, '.stryker-tmp/**'];

export function productionPolicyConfig(
  rules: Linter.RulesRecord,
  entryPointRules: Linter.RulesRecord = {},
): Linter.Config[] {
  const entryPointScripts =
    entryPoints.length > 0
      ? [
          {
            files: entryPoints,
            rules: { 'nitpicker/report-module-load-effects': 'off', ...entryPointRules },
          },
        ]
      : [];
  const config = linterConfigs([
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
  ]);
  const policy = readHeadPolicy();
  return applyMatchingRuleExceptions(applyJavascriptDialect(config, policy), policy.exceptions);
}

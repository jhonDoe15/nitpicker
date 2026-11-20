import type { Linter } from 'eslint';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mts';
import {
  applyJavascriptDialect,
  applyMatchingRuleExceptions,
  productionLayout,
  readHeadPolicy,
} from '../typed/policy-views.mts';
import { linterConfigs } from '../typed/config-types.mts';
import { carriedPolicyNames, productionPolicy } from '../production/carried-policies.mts';

const MODULE_EFFECTS = 'nitpicker/report-module-load-effects';

function entryPointEntries(
  entryPoints: readonly string[],
  rules: Linter.RulesRecord,
  scope: Linter.Config = {},
): Linter.Config[] {
  return entryPoints.length > 0 && Object.keys(rules).length > 0
    ? [{ files: [...entryPoints], ...scope, rules }]
    : [];
}

export function namedPolicyConfig(name: string): Linter.Config[] {
  const { rules, entryPointRules } = productionPolicy(name);
  return productionPolicyConfig(rules, entryPointRules);
}

export function productionPolicyConfig(
  rules: Linter.RulesRecord,
  entryPointRules: Linter.RulesRecord = {},
): Linter.Config[] {
  const { sourceGlobs, entryPoints, ignores } = productionLayout();
  const config = linterConfigs([
    { ignores },
    {
      files: sourceGlobs,
      languageOptions: {
        globals: globals.node,
        parser: tseslint.parser,
      },
      linterOptions: { noInlineConfig: true },
      plugins: {
        nitpicker: nitpickerRules,
      },
      rules,
    },
    ...entryPointEntries(entryPoints, { [MODULE_EFFECTS]: 'off', ...entryPointRules }),
  ]);
  const policy = readHeadPolicy();
  return applyMatchingRuleExceptions(applyJavascriptDialect(config, policy), policy.exceptions);
}

export function carriedPolicyConfigFor(
  environment: Readonly<Record<string, string | undefined>>,
): Linter.Config[] {
  const { sourceGlobs, entryPoints, testIgnores } = productionLayout();
  return carriedPolicyNames(environment).flatMap((name) => {
    const { rules, entryPointRules } = productionPolicy(name);
    return linterConfigs([
      { files: sourceGlobs, ignores: testIgnores, plugins: { nitpicker: nitpickerRules }, rules },
      ...entryPointEntries(
        entryPoints,
        {
          ...(Object.hasOwn(rules, MODULE_EFFECTS) ? { [MODULE_EFFECTS]: 'off' } : {}),
          ...entryPointRules,
        },
        { ignores: testIgnores },
      ),
    ]);
  });
}

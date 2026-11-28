import { fieldOf, listOf, textOf, textsOf } from '../../../shared/values/readers.mts';
import { isJavaTouchedRule } from '../../java/adapters/touched-rules.mts';
import { isPythonTouchedRule } from '../../python/rules/touched-rules.mts';
import { strictBoundaryRules } from './architecture/strict-boundary-rules.mts';
import { i18nRuleIds } from './eslint-config/i18n/i18n-rules.mts';
import { strictEslintRuleIds } from './eslint-config/policy/strict-rule-ids.mts';
import { isUnusedParameterFinding } from './eslint-config/policy/unused-parameters.mts';
import { reactRuleIds, reactTestRuleIds } from './eslint-config/react/react-rules.mts';
import { serverRuleIds } from './eslint-config/server/server-rules.mts';

type FindingFacts = { readonly tool?: string; readonly message?: string };

const PRETTIER_RULE = 'prettier/prettier';
const UNUSED_VARIABLES_RULE = '@typescript-eslint/no-unused-vars';

function isUnusedParameter(rule: string, finding?: FindingFacts) {
  return rule === UNUSED_VARIABLES_RULE && isUnusedParameterFinding(finding);
}

const strictRuleIds = new Set([
  ...strictEslintRuleIds,
  ...textsOf(reactRuleIds),
  ...textsOf(reactTestRuleIds),
  ...textsOf(i18nRuleIds),
  ...textsOf(serverRuleIds),
  ...listOf(strictBoundaryRules).map((rule) => textOf(fieldOf(rule, 'name'))),
]);

export function isStrictRule(rule: string, finding?: FindingFacts): boolean {
  return (
    strictRuleIds.has(rule) ||
    rule === PRETTIER_RULE ||
    isUnusedParameter(rule, finding) ||
    isJavaTouchedRule(rule, finding) ||
    isPythonTouchedRule(rule, finding)
  );
}

export function mustMeetOnEditedLines(rule: string, finding?: FindingFacts): boolean {
  return rule === PRETTIER_RULE || isUnusedParameter(rule, finding);
}

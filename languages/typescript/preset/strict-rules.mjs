import { isJavaTouchedRule } from '../../java/adapters/touched-rules.mjs';
import { isPythonTouchedRule } from '../../python/rules/touched-rules.mjs';
import { strictBoundaryRules } from './architecture/strict-boundary-rules.mjs';
import { i18nRuleIds } from './eslint-config/i18n/i18n-rules.mjs';
import { isUnusedParameterFinding } from './eslint-config/policy/unused-parameters.mjs';
import { reactRuleIds, reactTestRuleIds } from './eslint-config/react/react-rules.mjs';

// eslint-plugin-functional (about a second of CPU), which would tax every start of the CLI.
export const strictEslintRuleIds = [
  '@typescript-eslint/explicit-module-boundary-types',
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/only-throw-error',
  '@typescript-eslint/switch-exhaustiveness-check',
  'curly',
  'eqeqeq',
  'functional/no-classes',
  'functional/no-let',
  'functional/no-this-expressions',
  'functional/prefer-immutable-types',
  'nitpicker/exhaustive-union-predicate',
  'nitpicker/hermetic-git-in-tests',
  'nitpicker/naming-convention',
  'nitpicker/no-branch-in-composition-root',
  'nitpicker/no-comments',
  'nitpicker/no-default-export',
  'nitpicker/no-disabled-tls-verification',
  'nitpicker/no-first-test-charged-setup',
  'nitpicker/no-git-repository-per-test',
  'nitpicker/no-forwarding-method-alias',
  'nitpicker/no-forwarding-wrapper',
  'nitpicker/no-handwritten-boundary-guard',
  'nitpicker/no-magic-numbers',
  'nitpicker/no-module-level-let',
  'nitpicker/no-module-level-mutable-state',
  'nitpicker/no-mutating-method-in-domain',
  'nitpicker/no-node-process-per-test',
  'nitpicker/no-null',
  'nitpicker/no-process-access-outside-composition-root',
  'nitpicker/no-process-globals-outside-main-guard',
  'nitpicker/no-promise-chain',
  'nitpicker/no-raised-test-timeout',
  'nitpicker/no-self-recursion',
  'nitpicker/no-server-or-worker-per-test',
  'nitpicker/no-shell-string-command',
  'nitpicker/no-silent-catch',
  'nitpicker/no-sql-string-building',
  'nitpicker/no-throw',
  'nitpicker/no-uninjectable-delay',
  'nitpicker/no-ui-framework-in-domain',
  'nitpicker/no-unknown-in-domain',
  'nitpicker/no-unsafe-deserialization',
  'nitpicker/no-unsafe-path-join',
  'nitpicker/no-unvalidated-schema-field',
  'nitpicker/no-weak-hash',
  'nitpicker/preserve-error-cause',
  'nitpicker/require-http-timeout',
  'nitpicker/require-test-process-timeout',
  'nitpicker/test-tsconfig-pins-lib-and-types',
  'no-duplicate-imports',
  'no-empty',
  'no-eval',
  'no-param-reassign',
  'no-restricted-globals',
  'no-restricted-properties',
  'no-restricted-syntax',
  'regexp/no-super-linear-backtracking',
];

const PRETTIER_RULE = 'prettier/prettier';
const UNUSED_VARIABLES_RULE = '@typescript-eslint/no-unused-vars';

function isUnusedParameter(rule, finding) {
  return rule === UNUSED_VARIABLES_RULE && isUnusedParameterFinding(finding);
}

const strictRuleIds = new Set([
  ...strictEslintRuleIds,
  ...reactRuleIds,
  ...reactTestRuleIds,
  ...i18nRuleIds,
  ...strictBoundaryRules.map(({ name }) => name),
]);

export function isStrictRule(rule, finding) {
  return (
    strictRuleIds.has(rule) ||
    rule === PRETTIER_RULE ||
    isUnusedParameter(rule, finding) ||
    isJavaTouchedRule(rule, finding) ||
    isPythonTouchedRule(rule, finding)
  );
}

export function mustMeetOnEditedLines(rule, finding) {
  return rule === PRETTIER_RULE || isUnusedParameter(rule, finding);
}

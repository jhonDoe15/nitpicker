import { isJavaTouchedRule } from '../../java/adapters/touched-rules.mjs';
import { strictBoundaryRules } from './architecture/strict-boundary-rules.mjs';
import { reactRuleIds, reactTestRuleIds } from './eslint-config/react-rules.mjs';

// eslint-plugin-functional (about a second of CPU), which would tax every start of the CLI.
export const strictEslintRuleIds = [
  '@typescript-eslint/consistent-type-definitions',
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/only-throw-error',
  '@typescript-eslint/switch-exhaustiveness-check',
  'eqeqeq',
  'functional/no-classes',
  'functional/no-let',
  'functional/no-this-expressions',
  'functional/prefer-immutable-types',
  'nitpicker/hermetic-git-in-tests',
  'nitpicker/no-branch-in-composition-root',
  'nitpicker/no-comments',
  'nitpicker/no-first-test-charged-setup',
  'nitpicker/no-git-repository-per-test',
  'nitpicker/no-handwritten-boundary-guard',
  'nitpicker/no-module-level-let',
  'nitpicker/no-node-process-per-test',
  'nitpicker/no-process-globals-outside-main-guard',
  'nitpicker/no-raised-test-timeout',
  'nitpicker/no-self-recursion',
  'nitpicker/no-server-or-worker-per-test',
  'nitpicker/no-silent-catch',
  'nitpicker/no-throw',
  'nitpicker/no-uninjectable-delay',
  'nitpicker/no-unknown-in-domain',
  'nitpicker/no-unvalidated-schema-field',
  'nitpicker/preserve-error-cause',
  'nitpicker/test-tsconfig-pins-lib-and-types',
  'no-empty',
  'no-restricted-syntax',
];

const PRETTIER_RULE = 'prettier/prettier';

const strictRuleIds = new Set([
  ...strictEslintRuleIds,
  ...reactRuleIds,
  ...reactTestRuleIds,
  ...strictBoundaryRules.map(({ name }) => name),
]);

export function isStrictRule(rule, finding) {
  return strictRuleIds.has(rule) || rule === PRETTIER_RULE || isJavaTouchedRule(rule, finding);
}

export function mustMeetOnEditedLines(rule) {
  return rule === PRETTIER_RULE;
}

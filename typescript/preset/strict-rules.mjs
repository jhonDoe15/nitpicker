import { isJavaTouchedRule } from '../adapters/java/touched-rules.mjs';
import { strictBoundaryRules } from './architecture/strict-boundary-rules.mjs';

// Written out, not derived from `strictPresetConfig`: building that config loads typescript-eslint and
// eslint-plugin-functional (about a second of CPU), which would tax every start of the CLI.
// strict-rules.test.mjs asserts this list equals the rule ids of the real config.
export const strictEslintRuleIds = [
  '@typescript-eslint/consistent-type-definitions',
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/only-throw-error',
  '@typescript-eslint/switch-exhaustiveness-check',
  'functional/immutable-data',
  'functional/no-classes',
  'functional/no-let',
  'functional/no-this-expressions',
  'functional/prefer-immutable-types',
  'nitpicker/hermetic-git-in-tests',
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
  'nitpicker/preserve-error-cause',
  'nitpicker/test-tsconfig-pins-lib-and-types',
  'no-empty',
  'no-restricted-syntax',
];

const strictRuleIds = new Set([
  ...strictEslintRuleIds,
  ...strictBoundaryRules.map(({ name }) => name),
]);

/**
 * True for the rules the strict preset owns: its ESLint rules and its dependency boundary rules.
 * The differential gate holds findings of these rules to the strict standard in touched code
 * (docs/typescript-strict-preset.md). Descriptive metrics and the rules of third-party presets
 * that the strict rules do not replace keep the plain baseline comparison. The Java preset's
 * `changed-branch-coverage` (see adapters/java/touched-rules.mjs) is held to the same standard.
 */
export function isStrictRule(rule, finding) {
  return strictRuleIds.has(rule) || isJavaTouchedRule(rule, finding);
}

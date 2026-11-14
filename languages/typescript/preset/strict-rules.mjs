import { isJavaTouchedRule } from '../../java/adapters/touched-rules.mjs';
import { isPythonTouchedRule } from '../../python/rules/touched-rules.mjs';
import { strictBoundaryRules } from './architecture/strict-boundary-rules.mjs';
import { i18nRuleIds } from './eslint-config/i18n/i18n-rules.mjs';
import { isUnusedParameterFinding } from './eslint-config/policy/unused-parameters.mjs';
import { regexpRuleIds } from './eslint-config/regexp/regexp-rules.mjs';
import { reactRuleIds, reactTestRuleIds } from './eslint-config/react/react-rules.mjs';
import { serverRuleIds } from './eslint-config/server/server-rules.mjs';

// eslint-plugin-functional (about a second of CPU), which would tax every start of the CLI.
export const strictEslintRuleIds = [
  '@typescript-eslint/explicit-module-boundary-types',
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/only-throw-error',
  '@typescript-eslint/prefer-find',
  '@typescript-eslint/prefer-includes',
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
  'nitpicker/no-accumulating-spread',
  'nitpicker/no-retry-without-idempotency',
  'nitpicker/no-remote-call-under-lock',
  'nitpicker/no-remote-call-in-transaction',
  'nitpicker/no-lazy-relation-in-loop',
  'nitpicker/no-accumulator-concat',
  'nitpicker/no-io-in-loop',
  'nitpicker/no-costly-collection-form',
  'nitpicker/no-collected-stream-rows',
  'nitpicker/no-wasted-collection-step',
  'nitpicker/no-hardcoded-secret',
  'nitpicker/no-secret-in-log',
  'nitpicker/no-branch-in-composition-root',
  'nitpicker/no-comments',
  'nitpicker/no-compatibility-shim',
  'nitpicker/no-copied-constant',
  'nitpicker/no-default-export',
  'nitpicker/no-disabled-tls-verification',
  'nitpicker/no-dropped-test-callback',
  'nitpicker/no-eager-relation',
  'nitpicker/no-falsy-default',
  'nitpicker/no-first-test-charged-setup',
  'nitpicker/no-git-repository-per-test',
  'nitpicker/no-forwarding-method-alias',
  'nitpicker/no-forwarding-wrapper',
  'nitpicker/no-handwritten-boundary-guard',
  'nitpicker/no-in-memory-query',
  'nitpicker/no-magic-numbers',
  'nitpicker/no-many-to-many-cascade-remove',
  'nitpicker/no-module-level-let',
  'nitpicker/no-module-level-mutable-state',
  'nitpicker/no-multiple-collection-joins',
  'nitpicker/no-mutating-method-in-domain',
  'nitpicker/no-node-process-per-test',
  'nitpicker/no-parameter-mutation',
  'nitpicker/no-null',
  'nitpicker/no-orm-query-logging',
  'nitpicker/no-orm-schema-sync',
  'nitpicker/no-process-access-outside-composition-root',
  'nitpicker/no-process-globals-outside-main-guard',
  'nitpicker/no-promise-chain',
  'nitpicker/no-raised-test-timeout',
  'nitpicker/no-repeated-string-literal',
  'nitpicker/no-self-recursion',
  'nitpicker/no-server-or-worker-per-test',
  'nitpicker/no-service-locator',
  'nitpicker/no-shared-stateful-regex',
  'nitpicker/no-shell-string-command',
  'nitpicker/no-silent-catch',
  'nitpicker/no-singular-and-plural-prop',
  'nitpicker/no-sql-string-building',
  'nitpicker/no-string-as-regex',
  'nitpicker/no-cached-rejection',
  'nitpicker/no-cleanup-skipped-on-failure',
  'nitpicker/no-task-outliving-resource',
  'nitpicker/settle-pending-on-close',
  'nitpicker/release-listeners-on-close',
  'nitpicker/no-add-only-collection',
  'nitpicker/no-sync-node-api-in-async',
  'nitpicker/no-test-retry',
  'nitpicker/no-throw',
  'nitpicker/no-boolean-flag-parameter',
  'nitpicker/no-tri-state-boolean',
  'nitpicker/no-unbounded-query-array',
  'nitpicker/no-undefined-only-env-check',
  'nitpicker/no-unhandled-url-parse',
  'nitpicker/no-unindexed-foreign-key',
  'nitpicker/no-uninjectable-delay',
  'nitpicker/no-ui-framework-in-domain',
  'nitpicker/no-unhandled-void-promise',
  'nitpicker/no-unknown-in-domain',
  'nitpicker/no-unordered-query',
  'nitpicker/no-unsafe-deserialization',
  'nitpicker/no-unsafe-path-join',
  'nitpicker/no-unmapped-exception',
  'nitpicker/no-unvalidated-schema-field',
  'nitpicker/no-weak-hash',
  'nitpicker/preserve-error-cause',
  'nitpicker/require-client-timeout',
  'nitpicker/promise-wait-deadline',
  'nitpicker/reusable-object-per-call',
  'nitpicker/require-error-listener',
  'nitpicker/require-http-timeout',
  'nitpicker/require-process-timeout',
  'nitpicker/require-promise-reject',
  'nitpicker/require-test-process-timeout',
  'nitpicker/simpler-boolean-logic',
  'nitpicker/strict-boolean-expressions',
  'nitpicker/test-tsconfig-pins-lib-and-types',
  'nitpicker/time-unit-mismatch',
  'nitpicker/timeout-abandons-operation',
  'nitpicker/unbounded-fan-out',
  'nitpicker/unbounded-reactive-fan-out',
  'nitpicker/untested-round-trip',
  'no-duplicate-imports',
  'no-empty',
  'no-eval',
  'no-param-reassign',
  'no-restricted-globals',
  'no-restricted-properties',
  'no-restricted-syntax',
  'nitpicker/require-atomic-updates',
  ...regexpRuleIds,
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
  ...serverRuleIds,
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

import { CATCH_LOG_RULE } from '../../../source/catch-logging.mjs';
import { appendSentence } from '../../../../../shared/messages/exception-sentence.mjs';

const DETEKT_TOOL = 'detekt';
const COMPILER_WARNINGS = new Map([
  ['DEPRECATION', 'kotlinc/deprecation'],
  ['TYPEALIAS_EXPANSION_DEPRECATION', 'kotlinc/deprecation'],
  ['UNCHECKED_CAST', 'kotlinc/unchecked'],
  ['USELESS_CAST', 'kotlinc/cast'],
]);
const BANNED_SUPPRESSIONS = [
  /^all$/i,
  /^detekt(?:[.:]|$)/i,
  /^ktlint(?:[.:]|$)/i,
  /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/,
];
const DETEKT_RULESETS = new Set([
  'comments',
  'complexity',
  'coroutines',
  'empty-blocks',
  'exceptions',
  'formatting',
  'libraries',
  'naming',
  'performance',
  'potential-bugs',
  'ruleauthors',
  'style',
]);

export const ONE_WAY_RULES = [
  {
    name: 'UnsafeCallOnNullableType',
    ruleset: 'potential-bugs',
    allowed:
      'Handle null with `value ?: return`, `value?.let { ... }`, or `checkNotNull(value) { "why" }` when null is a bug.',
  },
  { name: 'CastNullableToNonNullableType', ruleset: 'potential-bugs' },
  {
    name: 'TooGenericExceptionCaught',
    ruleset: 'exceptions',
    allowed: 'In a test, use `assertFailsWith`.',
  },
  { name: 'GlobalCoroutineUsage', ruleset: 'coroutines' },
  {
    name: 'SuspendFunSwallowedCancellation',
    ruleset: 'coroutines',
    allowed:
      'Use a direct suspend call or catch only the expected specific exception; a Result helper must rethrow CancellationException immediately.',
  },
  { name: 'ForbiddenMethodCall', ruleset: 'style' },
  {
    name: 'UnnecessaryLet',
    ruleset: 'style',
    allowed: 'Call the member directly; `let` is for `value?.let { ... }`.',
  },
  {
    name: 'UnnecessaryApply',
    ruleset: 'style',
    allowed: 'Remove `apply`; use it only to configure an object you just created.',
  },
  { name: 'UseLet', ruleset: 'style' },
  { name: 'UseDataClass', ruleset: 'style' },
  { name: 'ForbiddenImport', ruleset: 'style' },
  { name: 'ForbiddenComment', ruleset: 'style' },
  {
    name: 'StringLiteralDuplication',
    ruleset: 'complexity',
    mainOnly: true,
    allowed: 'Name it once as a constant (`private const val NAME = "..."`) and use the constant.',
  },
  {
    name: 'DataClassShouldBeImmutable',
    ruleset: 'style',
    allowed: 'Make the property a `val` and build a changed copy with `copy(...)`.',
  },
].map((rule) => ({ ...rule, id: `detekt.${rule.ruleset}.${rule.name}` }));

export const SUPPRESSION_RULE = 'inline-suppression';
export const TEST_ASSERTION_RULE = 'test-without-assertion';

export const SOURCE_RULE_IDS = [CATCH_LOG_RULE, TEST_ASSERTION_RULE];

export const ONE_WAY_RULE_IDS = ONE_WAY_RULES.map(({ id }) => id);

export function isBannedSuppression(token) {
  return (
    DETEKT_RULESETS.has(token) ||
    COMPILER_WARNINGS.has(token) ||
    BANNED_SUPPRESSIONS.some((banned) => banned.test(token))
  );
}

export function compilerWarningRule(token) {
  return COMPILER_WARNINGS.get(token);
}

export function withAllowedForm(finding) {
  const rule = ONE_WAY_RULES.find(({ id }) => id === finding.rule);
  if (finding.tool !== DETEKT_TOOL || rule?.allowed === undefined) {
    return finding;
  }
  return { ...finding, message: appendSentence(finding.message, rule.allowed) };
}

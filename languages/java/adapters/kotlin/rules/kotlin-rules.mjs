import { CATCH_LOG_RULE } from '../../../source/catch-logging.mjs';

const DETEKT_TOOL = 'detekt';
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
    name: 'StringLiteralDuplication',
    ruleset: 'complexity',
    allowed: 'Name a constant and reuse it so changes stay consistent.',
  },
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
  return DETEKT_RULESETS.has(token) || BANNED_SUPPRESSIONS.some((banned) => banned.test(token));
}

export function appendSentence(message, sentence) {
  return `${message.replace(/\.?\s*$/, '')}. ${sentence}`;
}

export function addOneWayHint(finding) {
  const rule = ONE_WAY_RULES.find(({ id }) => id === finding.rule);
  if (finding.tool !== DETEKT_TOOL || rule === undefined) {
    return finding;
  }
  const exception = `To allow it on specific paths, add an "exceptions" entry for rule ${rule.id} in nitpicker.config.json.`;
  const withAllowed =
    rule.allowed === undefined ? finding.message : appendSentence(finding.message, rule.allowed);
  return { ...finding, message: appendSentence(withAllowed, exception) };
}

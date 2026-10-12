const DETEKT_TOOL = 'detekt';
const ALL_SUPPRESSION = /^(?:detekt[.:])?all$/i;

export const ONE_WAY_RULES = [
  {
    name: 'UnsafeCallOnNullableType',
    ruleset: 'potential-bugs',
    allowed:
      'Handle null with `value ?: return`, `value?.let { ... }`, or `checkNotNull(value) { "why" }` when null is a bug.',
  },
  { name: 'CastNullableToNonNullableType', ruleset: 'potential-bugs' },
  { name: 'GlobalCoroutineUsage', ruleset: 'coroutines' },
  { name: 'ForbiddenMethodCall', ruleset: 'style' },
  {
    name: 'ForbiddenImport',
    ruleset: 'style',
    allowed:
      'Make the caller `suspend` (`suspend fun main()` for an entry point) and use `coroutineScope { ... }` for concurrent work.',
  },
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

export const ONE_WAY_RULE_IDS = ONE_WAY_RULES.map(({ id }) => id);

const SUPPRESSION_TOKENS = new Set([
  ...ONE_WAY_RULES.flatMap(({ name, ruleset }) => [
    name,
    `detekt.${name}`,
    `detekt:${name}`,
    `detekt.${ruleset}.${name}`,
    `detekt:${ruleset}:${name}`,
  ]),
  ...ONE_WAY_RULES.flatMap(({ ruleset }) => [ruleset, `detekt.${ruleset}`, `detekt:${ruleset}`]),
]);

export function isBannedSuppression(token) {
  return SUPPRESSION_TOKENS.has(token) || ALL_SUPPRESSION.test(token);
}

function appendSentence(message, sentence) {
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

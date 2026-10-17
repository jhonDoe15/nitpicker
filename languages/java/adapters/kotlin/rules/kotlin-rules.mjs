const DETEKT_TOOL = 'detekt';
const STYLE = 'style';
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
  STYLE,
]);

export const ONE_WAY_RULES = [
  {
    name: 'UnsafeCallOnNullableType',
    ruleset: 'potential-bugs',
    allowed:
      'Handle null with `value ?: return`, `value?.let { ... }`, or `checkNotNull(value) { "why" }` when null is a bug.',
  },
  { name: 'CastNullableToNonNullableType', ruleset: 'potential-bugs' },
  { name: 'GlobalCoroutineUsage', ruleset: 'coroutines' },
  { name: 'ForbiddenMethodCall', ruleset: STYLE },
  { name: 'ForbiddenImport', ruleset: STYLE },
  {
    name: 'UnnecessaryLet',
    ruleset: STYLE,
    allowed: 'Call the member directly; `let` is for `value?.let { ... }`.',
  },
  {
    name: 'UnnecessaryApply',
    ruleset: STYLE,
    allowed: 'Remove `apply`; use it only to configure an object you just created.',
  },
  { name: 'UseLet', ruleset: STYLE },
  { name: 'UseDataClass', ruleset: STYLE },
  {
    name: 'DataClassShouldBeImmutable',
    ruleset: STYLE,
    allowed: 'Make the property a `val` and build a changed copy with `copy(...)`.',
  },
].map((rule) => ({ ...rule, id: `detekt.${rule.ruleset}.${rule.name}` }));

export const SUPPRESSION_RULE = 'inline-suppression';

export const ONE_WAY_RULE_IDS = ONE_WAY_RULES.map(({ id }) => id);

export function isBannedSuppression(token) {
  return DETEKT_RULESETS.has(token) || BANNED_SUPPRESSIONS.some((banned) => banned.test(token));
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

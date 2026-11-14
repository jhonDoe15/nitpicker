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
  /^[A-Z][\dA-Z]*[a-z][\dA-Za-z]*$/,
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

const RULESET_QUALIFIED = new RegExp(`^(?:${[...DETEKT_RULESETS].join('|')})[.:]`);

export const ONE_WAY_RULES = [
  {
    name: 'UnsafeCallOnNullableType',
    ruleset: 'potential-bugs',
    allowed:
      'Handle null with `value ?: return`, `value?.let { ... }`, or `checkNotNull(value) { "why" }` when null is a bug.',
  },
  { name: 'CastNullableToNonNullableType', ruleset: 'potential-bugs' },
  {
    name: 'CastToNullableType',
    ruleset: 'potential-bugs',
    allowed: 'Use `as? T` and handle the null; `as T?` still throws when the type is wrong.',
  },
  {
    name: 'DontDowncastCollectionTypes',
    ruleset: 'potential-bugs',
    allowed:
      'Copy it with `toMutableList()`, `toMutableMap()` or `toMutableSet()`, or ask for the mutable type at its source.',
  },
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
      'Make a direct suspend call and catch only the specific exception you expect, so cancellation still reaches the coroutine.',
  },
  {
    name: 'InjectDispatcher',
    ruleset: 'coroutines',
    mainOnly: true,
    allowed:
      'Inject the dispatcher (`dispatcher: CoroutineDispatcher = Dispatchers.IO` as a parameter default), so a test can pass a test dispatcher.',
  },
  {
    name: 'RedundantSuspendModifier',
    ruleset: 'coroutines',
    allowed: 'Remove the `suspend` modifier, or call a suspending function in the body.',
  },
  {
    name: 'SleepInsteadOfDelay',
    ruleset: 'coroutines',
    allowed:
      'Use `delay`, which suspends the coroutine instead of blocking its thread (in a test, `delay` under `runTest` runs in virtual time).',
  },
  {
    name: 'SuspendFunWithFlowReturnType',
    ruleset: 'coroutines',
    allowed:
      'Remove `suspend` and return the Flow from a plain function: a Flow is cold, and collecting it is what suspends.',
  },
  {
    name: 'SuspendFunWithCoroutineScopeReceiver',
    ruleset: 'coroutines',
    allowed:
      'Either keep `suspend` and use `coroutineScope { ... }` inside, or drop `suspend` for an extension that only launches coroutines in the receiver scope.',
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
  {
    name: 'CollapsibleIfStatements',
    ruleset: 'style',
    allowed:
      'Merge them into one `if (a && b)`, with a condition that holds `||` in parentheses; nesting stays when the outer `if` has an `else` or other statements.',
  },
  {
    name: 'UnusedParameter',
    ruleset: 'style',
    mainOnly: true,
    allowed:
      'Remove the parameter and update the callers, or use it. An override, `main`, a function with any annotation other than `@Deprecated`, `@Suppress`, `@Throws`, `@JvmStatic`, `@JvmOverloads` or `@JvmName` (`@GetMapping`, `@Bean`, `@Test`, `@Inject`, ...) and a name starting `ignored` or `unused` are skipped.',
  },
  { name: 'UseDataClass', ruleset: 'style' },
  { name: 'ForbiddenImport', ruleset: 'style' },
  { name: 'ForbiddenComment', ruleset: 'style' },
  {
    name: 'DataClassShouldBeImmutable',
    ruleset: 'style',
    allowed: 'Make the property a `val` and build a changed copy with `copy(...)`.',
  },
].map((rule) => ({ ...rule, id: `detekt.${rule.ruleset}.${rule.name}` }));

const UNUSED_CODE_TOKENS = new Set(['unused', 'UNUSED_PARAMETER', 'UNUSED_VARIABLE']);

export function isUnusedCodeSuppression(token) {
  return UNUSED_CODE_TOKENS.has(token);
}

export const DISABLED_DETEKT_RULES = ['detekt.complexity.StringLiteralDuplication'];

export const SUPPRESSION_RULE = 'inline-suppression';
export const TEST_ASSERTION_RULE = 'test-without-assertion';

export const SOURCE_RULE_IDS = [CATCH_LOG_RULE, TEST_ASSERTION_RULE];

export const ONE_WAY_RULE_IDS = ONE_WAY_RULES.map(({ id }) => id);

export function isBannedSuppression(token) {
  return (
    DETEKT_RULESETS.has(token) ||
    COMPILER_WARNINGS.has(token) ||
    RULESET_QUALIFIED.test(token) ||
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
  return {
    ...finding,
    message: appendSentence(finding.message, rule.allowed),
    allowedForm: rule.allowed,
  };
}

import { CATCH_LOG_RULE } from '../../../source/catch-logging.mts';
import { appendSentence as untypedAppendSentence } from '../../../../../shared/messages/exception-sentence.mjs';
export type RuleFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path?: string | undefined;
  readonly message: string;
  readonly classification: string;
  readonly allowedForm?: string | undefined;
  readonly [field: string]: unknown;
};

const appendSentence: (message: string, sentence: string | undefined) => string =
  untypedAppendSentence;

const DETEKT_TOOL = 'detekt';
const POTENTIAL_BUGS = 'potential-bugs';
const COROUTINES = 'coroutines';
const STYLE = 'style';
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
  COROUTINES,
  'empty-blocks',
  'exceptions',
  'formatting',
  'libraries',
  'naming',
  'performance',
  POTENTIAL_BUGS,
  'ruleauthors',
  STYLE,
]);

const RULESET_QUALIFIED = new RegExp(`^(?:${[...DETEKT_RULESETS].join('|')})[.:]`);

export const ONE_WAY_RULES = [
  {
    name: 'UnsafeCallOnNullableType',
    ruleset: POTENTIAL_BUGS,
    allowed:
      'Handle null with `value ?: return`, `value?.let { ... }`, or `checkNotNull(value) { "why" }` when null is a bug.',
  },
  { name: 'CastNullableToNonNullableType', ruleset: POTENTIAL_BUGS },
  {
    name: 'CastToNullableType',
    ruleset: POTENTIAL_BUGS,
    allowed: 'Use `as? T` and handle the null; `as T?` still throws when the type is wrong.',
  },
  {
    name: 'DontDowncastCollectionTypes',
    ruleset: POTENTIAL_BUGS,
    allowed:
      'Copy it with `toMutableList()`, `toMutableMap()` or `toMutableSet()`, or ask for the mutable type at its source.',
  },
  {
    name: 'TooGenericExceptionCaught',
    ruleset: 'exceptions',
    allowed: 'In a test, use `assertFailsWith`.',
  },
  { name: 'GlobalCoroutineUsage', ruleset: COROUTINES },
  {
    name: 'SuspendFunSwallowedCancellation',
    ruleset: COROUTINES,
    allowed:
      'Make a direct suspend call and catch only the specific exception you expect, so cancellation still reaches the coroutine.',
  },
  {
    name: 'InjectDispatcher',
    ruleset: COROUTINES,
    mainOnly: true,
    allowed:
      'Inject the dispatcher (`dispatcher: CoroutineDispatcher = Dispatchers.IO` as a parameter default), so a test can pass a test dispatcher.',
  },
  {
    name: 'RedundantSuspendModifier',
    ruleset: COROUTINES,
    allowed: 'Remove the `suspend` modifier, or call a suspending function in the body.',
  },
  {
    name: 'SleepInsteadOfDelay',
    ruleset: COROUTINES,
    allowed:
      'Use `delay`, which suspends the coroutine instead of blocking its thread (in a test, `delay` under `runTest` runs in virtual time).',
  },
  {
    name: 'SuspendFunWithFlowReturnType',
    ruleset: COROUTINES,
    allowed:
      'Remove `suspend` and return the Flow from a plain function: a Flow is cold, and collecting it is what suspends.',
  },
  {
    name: 'SuspendFunWithCoroutineScopeReceiver',
    ruleset: COROUTINES,
    allowed:
      'Either keep `suspend` and use `coroutineScope { ... }` inside, or drop `suspend` for an extension that only launches coroutines in the receiver scope.',
  },
  { name: 'ForbiddenMethodCall', ruleset: STYLE },
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
  {
    name: 'CollapsibleIfStatements',
    ruleset: STYLE,
    allowed:
      'Merge them into one `if (a && b)`, with a condition that holds `||` in parentheses; nesting stays when the outer `if` has an `else` or other statements.',
  },
  {
    name: 'UnusedParameter',
    ruleset: STYLE,
    mainOnly: true,
    allowed:
      'Remove the parameter and update the callers, or use it. An override, `main`, a function with any annotation other than `@Deprecated`, `@Suppress`, `@Throws`, `@JvmStatic`, `@JvmOverloads` or `@JvmName` (`@GetMapping`, `@Bean`, `@Test`, `@Inject`, ...) and a name starting `ignored` or `unused` are skipped.',
  },
  { name: 'UseDataClass', ruleset: STYLE },
  { name: 'ForbiddenImport', ruleset: STYLE },
  { name: 'ForbiddenComment', ruleset: STYLE },
  {
    name: 'DataClassShouldBeImmutable',
    ruleset: STYLE,
    allowed: 'Make the property a `val` and build a changed copy with `copy(...)`.',
  },
].map((rule) => ({ ...rule, id: `detekt.${rule.ruleset}.${rule.name}` }));

const UNUSED_CODE_TOKENS = new Set(['unused', 'UNUSED_PARAMETER', 'UNUSED_VARIABLE']);

export function isUnusedCodeSuppression(token: string): boolean {
  return UNUSED_CODE_TOKENS.has(token);
}

export const DISABLED_DETEKT_RULES = ['detekt.complexity.StringLiteralDuplication'];

export const SUPPRESSION_RULE = 'inline-suppression';
export const TEST_ASSERTION_RULE = 'test-without-assertion';

export const SOURCE_RULE_IDS = [CATCH_LOG_RULE, TEST_ASSERTION_RULE];

export const ONE_WAY_RULE_IDS = ONE_WAY_RULES.map(({ id }) => id);

export function isBannedSuppression(token: string): boolean {
  return (
    DETEKT_RULESETS.has(token) ||
    COMPILER_WARNINGS.has(token) ||
    RULESET_QUALIFIED.test(token) ||
    BANNED_SUPPRESSIONS.some((banned) => banned.test(token))
  );
}

export function compilerWarningRule(token: string): string | undefined {
  return COMPILER_WARNINGS.get(token);
}

export function withAllowedForm(finding: RuleFinding): RuleFinding {
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

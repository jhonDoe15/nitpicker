import { exceptionRoute } from '../../../../shared/exceptions/rule-names.mjs';
import { appendSentence } from '../../../../shared/messages/exception-sentence.mjs';
import { readLayout } from '../../preset/head-policy.mjs';
import { immutableTypesMessage } from './immutable-types-hint.mjs';
import { restrictedMatchers } from '../../preset/eslint-config/test-honesty/restricted-matchers.mjs';

const IMMUTABLE_TYPES_PREFIX =
  /^(Variable|Parameter|Return type|Property) should have an immutability of at least/u;

const REJECT_ERRORS_TEST_HINT =
  ' In tests, reject with `vi.fn().mockRejectedValue(value)` to use a non-Error reason.';

const FIX_TYPE_ERROR_FIRST = 'fix any TypeScript error on the line first';

const UNRESOLVED_TYPE =
  /could not be resolved|cannot be resolved|error typed|of type error\b|of an error /u;

const UNRESOLVED_TYPE_HINT =
  ' The type is unresolved because of a TypeScript error, often a failed import: fix that error first.';

const ASYMMETRIC_MATCHER_HINT = ` In tests the \`any\` usually comes from an asymmetric matcher (\`expect.any\`, \`expect.stringContaining\`, \`expect.objectContaining\`): assert the whole value with \`toEqual\`, and ${FIX_TYPE_ERROR_FIRST}.`;

const LEGACY_ANY_HINT = ` If the value is a legacy \`any\`, read it through one reader function whose parameter is \`unknown\` and that returns a typed object, kept in adapters/; ${FIX_TYPE_ERROR_FIRST}.`;

const DOMAIN_LEGACY_ANY_HINT = ` If the value is a legacy \`any\`, domain/ cannot take \`unknown\`: have adapters/ parse it into a typed object and pass that in, or type the legacy parameter; ${FIX_TYPE_ERROR_FIRST}.`;

const JAVASCRIPT_TYPE_SOURCE =
  ' Give the value a JSDoc type at its source (`@param {string} name`, `@returns {Type}`, `@type {Type}`)';

const JAVASCRIPT_LEGACY_ANY_HINT = `${JAVASCRIPT_TYPE_SOURCE}, or read fields of a legacy \`any\` value through one reader function whose parameter is \`{unknown}\` and that returns a typed object.`;

const JAVASCRIPT_DOMAIN_LEGACY_ANY_HINT = `${JAVASCRIPT_TYPE_SOURCE}: domain/ cannot take \`{unknown}\`, so have adapters/ parse a legacy \`any\` value into a typed object and pass that in.`;

const DOMAIN_PATH = /(?:^|\/)features\/[^/]+\/domain\//u;

const ONLY_THROW_ERROR_TEXT = 'Expected an error object to be thrown.';

const THROW_ERROR_HINT = 'Throw an Error subclass.';

const THROW_ERROR_TEST_HINT = `${THROW_ERROR_HINT} A test double that must throw a non-Error value types it \`unknown\`: \`const value: unknown = 7; throw value;\`.`;

const NO_ASSERTIONS_TEXT = 'Test has no assertions';

const NO_ASSERTIONS_HINT = `${NO_ASSERTIONS_TEXT}. Call \`expect\` in the test body: asserting helpers do not count, so return the value and \`expect\` it in the test.`;

const DUPLICATE_CONSTITUENTS_HINT =
  ' The members are now the same type: use the one type the feature exports (e.g. `import type { Message }`), not a `ReturnType<...>` alias.';

const INVALID_VOID_HINT =
  ' Use `undefined` instead of `void` here: `Promise.withResolvers<undefined>()` and `resolve(undefined)`.';

const SWITCH_NOT_EXHAUSTIVE_TEXT = 'Switch is not exhaustive';

const SWITCH_NOT_EXHAUSTIVE_HINT =
  '. If this function is already over a size limit, adding cases will fail the size check: extract an exhaustive helper instead (e.g. a `Record<Union, number>` lookup).';

const DISABLED_TEST_TAIL =
  /\s*-\s*if you want to skip a test(?: suite)? temporarily, use \.todo\(\) instead$/u;

const DISABLED_TEST_HINT =
  '. Make it pass, or delete it together with the code it tests: do not skip it or mark it `todo`.';

const UNUSED_PARAMETER_TAIL =
  /\s*(?:Allowed unused args must match [^\s]+|Unused parameters should start with a '_')\.$/u;

const UNUSED_PARAMETER_HINT =
  ' Remove the parameter and update the callers. One that an override or a callback signature requires starts with `_` (`_context`).';

const BACKTICKED_MATCHER = /`([\w.]+)`/u;

const PREFER_CALLED_WITH_TEXT =
  'A bare `toHaveBeenCalled()` passes for a call with any arguments. Assert them with `toHaveBeenCalledWith(...)`. An exception fits only when the arguments cannot be pinned.';

const THROW_MESSAGE_TEXT =
  "A bare `toThrow()` passes for any error. Pass the expected message: `toThrow('the message')`. An exception fits only when the message cannot be pinned.";
const EXPECT_THROWS_HINT =
  ' In a test, assert a failure with `expect(() => run()).toThrow(Specific)` or `await expect(promise).rejects.toThrow(Specific)` instead of asserting inside a `catch`.';

const NODE_TEST_HINT =
  ' nitpicker runs node:test files, but lints every test file with the Vitest rules. An exception fits only a file that must stay on node:test.';

const FLOATING_PROMISE_TEXT = /^Promises must be awaited/u;

const FLOATING_PROMISE_MESSAGE = `Await this promise: \`await job()\`, or \`await Promise.all([...])\` for several; \`.then()\` and \`.catch()\` do not count. Deliberate fire-and-forget is written \`void job();\`.`;

const EVAL_MESSAGE = `Do not evaluate a string as code. Call the function directly, look it up in a table keyed by name, or parse the data with JSON.parse and a schema.`;

const PARAM_REASSIGN_HINT = ` Declare a new const with another name instead of reassigning the parameter. An exception fits only when the reassignment is deliberate.`;

const CURLY_HINT = ` Wrap the body in braces: \`if (done) { return; }\`.`;

const NAMING_HINT = `. Types are PascalCase; functions, variables and parameters are camelCase; constants may be UPPER_CASE; a schema constant may be PascalCase (\`const Order = z.object(...)\`). An exception fits only when an external API forces the name.`;

const REGEXP_HINT = ` Rewrite the pattern without nested or overlapping quantifiers, or use a string method. An exception fits only when the input is bounded and trusted.`;

const RETURN_TYPE_TEXT = /^Missing return type on function\.?$/u;

const RETURN_TYPE_MESSAGE =
  'Write the return type of an exported function: `export function total(rows: readonly Row[]): number`, `export async function load(): Promise<Report>`; a React component returns `ReactElement`.';

const ARGUMENT_TYPE_HINT = ' Write the parameter type in the signature: `(rows: readonly Row[])`.';

const DUPLICATE_IMPORT_HINT = ' Merge the imports of one module into a single import statement.';

const DEPRECATED_HINT = ` Call the replacement that the deprecation names instead of the deprecated API. An exception fits only when it names none and the API cannot be avoided.`;

const GROWTH_ADVICE = new Map([
  [
    'nitpicker/no-throw',
    'This function had {base} of these at base and the count may not grow: a throw on a new line counts as new even when the count holds, so edit an existing throw line in place to throw a reason a new helper returns, or return a union from a new helper function.',
  ],
]);

function immutableTypesRewrite({ text, node, sourceFile }) {
  const kind = IMMUTABLE_TYPES_PREFIX.exec(text)?.[1];
  return kind === undefined ? text : immutableTypesMessage({ kind, node, sourceFile });
}

function rejectErrorsMessage({ text, relativePath }) {
  return readLayout().isTestFile(relativePath) ? `${text}${REJECT_ERRORS_TEST_HINT}` : text;
}

function legacyAnyHint(relativePath) {
  const inDomain = DOMAIN_PATH.test(relativePath);
  if (readLayout().javascript) {
    return inDomain ? JAVASCRIPT_DOMAIN_LEGACY_ANY_HINT : JAVASCRIPT_LEGACY_ANY_HINT;
  }
  return inDomain ? DOMAIN_LEGACY_ANY_HINT : LEGACY_ANY_HINT;
}

function unsafeAnyMessage({ text, relativePath }) {
  if (UNRESOLVED_TYPE.test(text)) {
    return `${text}${UNRESOLVED_TYPE_HINT}`;
  }
  if (readLayout().isTestFile(relativePath)) {
    return `${text}${ASYMMETRIC_MATCHER_HINT}`;
  }
  return `${text}${legacyAnyHint(relativePath)}`;
}

function onlyThrowErrorMessage({ text, relativePath }) {
  if (text !== ONLY_THROW_ERROR_TEXT) {
    return text;
  }
  return readLayout().isTestFile(relativePath) ? THROW_ERROR_TEST_HINT : THROW_ERROR_HINT;
}

function expectExpectMessage({ text }) {
  return text === NO_ASSERTIONS_TEXT ? NO_ASSERTIONS_HINT : text;
}

function duplicateConstituentsMessage({ text }) {
  return `${text}${DUPLICATE_CONSTITUENTS_HINT}`;
}

function invalidVoidMessage({ text }) {
  return `${text}${INVALID_VOID_HINT}`;
}

function switchExhaustivenessMessage({ text }) {
  return text.startsWith(SWITCH_NOT_EXHAUSTIVE_TEXT)
    ? `${text}${SWITCH_NOT_EXHAUSTIVE_HINT}`
    : text;
}

function disabledTestMessage({ text }) {
  return `${text.replace(DISABLED_TEST_TAIL, '').replace(/\.$/u, '')}${DISABLED_TEST_HINT}`;
}

function restrictedMatcherMessage({ text }) {
  const matcher = BACKTICKED_MATCHER.exec(text)?.[1];
  return (matcher === undefined ? undefined : restrictedMatchers[matcher]) ?? text;
}

function floatingPromiseMessage({ text }) {
  return FLOATING_PROMISE_TEXT.test(text) ? FLOATING_PROMISE_MESSAGE : text;
}

function boundaryTypesMessage({ text }) {
  return RETURN_TYPE_TEXT.test(text)
    ? RETURN_TYPE_MESSAGE
    : `${text.replace(/\.?$/u, '.')}${ARGUMENT_TYPE_HINT}`;
}

function unusedVariableMessage({ text }) {
  return UNUSED_PARAMETER_TAIL.test(text)
    ? `${text.replace(UNUSED_PARAMETER_TAIL, '')}${UNUSED_PARAMETER_HINT}`
    : text;
}

function appendHint(hint) {
  return ({ text }) => `${text}${hint}`;
}

function nodeTestMessage({ text }) {
  return `${text}${NODE_TEST_HINT}`;
}

const MESSAGE_REWRITERS = new Map([
  ['vitest/no-import-node-test', nodeTestMessage],
  ['vitest/no-disabled-tests', disabledTestMessage],
  ['vitest/no-restricted-matchers', restrictedMatcherMessage],
  ['vitest/prefer-called-with', () => PREFER_CALLED_WITH_TEXT],
  ['vitest/require-to-throw-message', () => THROW_MESSAGE_TEXT],
  ['functional/prefer-immutable-types', immutableTypesRewrite],
  ['@typescript-eslint/prefer-promise-reject-errors', rejectErrorsMessage],
  ['@typescript-eslint/no-unsafe-member-access', unsafeAnyMessage],
  ['@typescript-eslint/no-unsafe-argument', unsafeAnyMessage],
  ['@typescript-eslint/no-unsafe-assignment', unsafeAnyMessage],
  ['@typescript-eslint/no-unsafe-call', unsafeAnyMessage],
  ['@typescript-eslint/no-unsafe-return', unsafeAnyMessage],
  ['@typescript-eslint/only-throw-error', onlyThrowErrorMessage],
  ['vitest/expect-expect', expectExpectMessage],
  ['vitest/no-conditional-expect', appendHint(EXPECT_THROWS_HINT)],
  ['@typescript-eslint/no-duplicate-type-constituents', duplicateConstituentsMessage],
  ['@typescript-eslint/switch-exhaustiveness-check', switchExhaustivenessMessage],
  ['@typescript-eslint/no-invalid-void-type', invalidVoidMessage],
  ['@typescript-eslint/no-floating-promises', floatingPromiseMessage],
  ['nitpicker/naming-convention', appendHint(NAMING_HINT)],
  ['@typescript-eslint/explicit-module-boundary-types', boundaryTypesMessage],
  ['no-eval', () => EVAL_MESSAGE],
  ['no-param-reassign', appendHint(PARAM_REASSIGN_HINT)],
  ['@typescript-eslint/no-unused-vars', unusedVariableMessage],
  ['curly', appendHint(CURLY_HINT)],
  ['no-duplicate-imports', appendHint(DUPLICATE_IMPORT_HINT)],
  ['regexp/no-super-linear-backtracking', appendHint(REGEXP_HINT)],
  ['@typescript-eslint/no-deprecated', appendHint(DEPRECATED_HINT)],
]);

const NO_ROUTE_RULES = new Set([
  'eslint/unused-disable-directive',
  'eslint/inline-config-disabled',
]);

export function eslintRoute({ rule, path: relativePath }) {
  return NO_ROUTE_RULES.has(rule) ? undefined : exceptionRoute({ rule, path: relativePath });
}

function withEslintRoute(text, finding) {
  return appendSentence(text, eslintRoute(finding));
}

export function metricWorseMessage(finding, plan) {
  return withEslintRoute(
    `${finding.symbol ?? 'This function'} ${plan.label} grew from {base} to ${String(plan.value)}. Put new code in a new function.`,
    finding,
  );
}

export function eslintMessageWithHint({ ruleId, text, relativePath, node, sourceFile }) {
  const rewrite = MESSAGE_REWRITERS.get(ruleId);
  return rewrite === undefined ? text : rewrite({ text, relativePath, node, sourceFile });
}

export function routedEslintMessage(options) {
  return withEslintRoute(eslintMessageWithHint(options), {
    rule: options.ruleId,
    path: options.relativePath,
  });
}

export function growthAdviceFor(ruleId) {
  return GROWTH_ADVICE.get(ruleId);
}

const UNSUPPORTED_DIRECTIVE_TEXT = '/* eslint-env */ comments are no longer supported';

export function withoutFatalDirectives(messages) {
  return messages.filter(
    (message) =>
      !(message?.fatal === true && message.message?.startsWith(UNSUPPORTED_DIRECTIVE_TEXT)),
  );
}

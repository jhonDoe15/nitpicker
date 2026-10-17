import { readLayout } from '../../preset/head-policy.mjs';
import { projectRunnerVocabulary } from '../../preset/test-runner/runner-vocabulary.mjs';
import { immutableTypesMessage } from './immutable-types-hint.mjs';

const IMMUTABLE_TYPES_PREFIX =
  /^(Variable|Parameter|Return type|Property) should have an immutability of at least/u;

const FIX_TYPE_ERROR_FIRST = 'fix any TypeScript error on the line first';

const UNRESOLVED_TYPE =
  /could not be resolved|cannot be resolved|error typed|of type error\b|of an error /u;

const UNRESOLVED_TYPE_HINT =
  ' The type is unresolved because of a TypeScript error, often a failed import: fix that error first.';

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

const DUPLICATE_CONSTITUENTS_HINT =
  ' The members are now the same type: use the one type the feature exports (e.g. `import type { Message }`), not a `ReturnType<...>` alias.';

const INVALID_VOID_HINT =
  ' Use `undefined` instead of `void` here: `Promise.withResolvers<undefined>()` and `resolve(undefined)`.';

const SWITCH_NOT_EXHAUSTIVE_TEXT = 'Switch is not exhaustive';

const SWITCH_NOT_EXHAUSTIVE_HINT =
  '. If this function is already over a size limit, adding cases will fail the size check: extract an exhaustive helper instead (e.g. a `Record<Union, number>` lookup).';

const NODE_TEST_HINT =
  ' nitpicker runs this project\'s tests with Vitest, which does not collect node:test files. Import from `vitest`, or, if the project runs its tests with node:test, set "tools.tests.runner" to "node" in nitpicker.config.json.';

const EXCEPTION_ROUTE = 'add an exception for this rule in nitpicker.config.json';

const FLOATING_PROMISE_TEXT = /^Promises must be awaited/u;

const FLOATING_PROMISE_MESSAGE = `Await this promise: \`await job()\`, or \`await Promise.all([...])\` for several; \`.then()\` and \`.catch()\` do not count. Deliberate fire-and-forget is written \`void job();\`.`;

const EVAL_MESSAGE = `Do not evaluate a string as code. Call the function directly, look it up in a table keyed by name, or parse the data with JSON.parse and a schema. If it is unavoidable, ${EXCEPTION_ROUTE}.`;

const PARAM_REASSIGN_HINT = ` Declare a new const with another name instead of reassigning the parameter. If the reassignment is deliberate, ${EXCEPTION_ROUTE}.`;

const CURLY_HINT = ` Wrap the body in braces: \`if (done) { return; }\`. To keep a file as it is, ${EXCEPTION_ROUTE}.`;

const NAMING_HINT = `. Types are PascalCase; functions, variables and parameters are camelCase; constants may be UPPER_CASE; a schema constant may be PascalCase (\`const Order = z.object(...)\`). If an external API forces the name, ${EXCEPTION_ROUTE}.`;

const REGEXP_HINT = ` Rewrite the pattern without nested or overlapping quantifiers, or use a string method. If the input is bounded and trusted, ${EXCEPTION_ROUTE}.`;

const RETURN_TYPE_TEXT = /^Missing return type on function\.?$/u;

const RETURN_TYPE_MESSAGE =
  'Write the return type of an exported function: `export function total(rows: readonly Row[]): number`, `export async function load(): Promise<Report>`; a React component returns `ReactElement`.';

const ARGUMENT_TYPE_HINT = ' Write the parameter type in the signature: `(rows: readonly Row[])`.';

const DUPLICATE_IMPORT_HINT = ' Merge the imports of one module into a single import statement.';

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
  if (!readLayout().isTestFile(relativePath)) {
    return text;
  }
  return `${text} In tests, reject with ${projectRunnerVocabulary().rejection} to use a non-Error reason.`;
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
    return `${text} In tests the \`any\` usually comes from ${projectRunnerVocabulary().anyInTests}, and ${FIX_TYPE_ERROR_FIRST}.`;
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
  if (text !== NO_ASSERTIONS_TEXT) {
    return text;
  }
  const { assertCall, assertIt } = projectRunnerVocabulary();
  return `${NO_ASSERTIONS_TEXT}. Call ${assertCall} in the test body: asserting helpers do not count, so return the value and ${assertIt} in the test.`;
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

function floatingPromiseMessage({ text }) {
  return FLOATING_PROMISE_TEXT.test(text)
    ? FLOATING_PROMISE_MESSAGE
    : `${text} ${EXCEPTION_ROUTE}.`;
}

function boundaryTypesMessage({ text }) {
  return RETURN_TYPE_TEXT.test(text)
    ? RETURN_TYPE_MESSAGE
    : `${text.replace(/\.?$/u, '.')}${ARGUMENT_TYPE_HINT}`;
}

function appendHint(hint) {
  return ({ text }) => `${text}${hint}`;
}

function nodeTestMessage({ text }) {
  return `${text}${NODE_TEST_HINT}`;
}

const MESSAGE_REWRITERS = new Map([
  ['vitest/no-import-node-test', nodeTestMessage],
  ['functional/prefer-immutable-types', immutableTypesRewrite],
  ['@typescript-eslint/prefer-promise-reject-errors', rejectErrorsMessage],
  ['@typescript-eslint/no-unsafe-member-access', unsafeAnyMessage],
  ['@typescript-eslint/no-unsafe-argument', unsafeAnyMessage],
  ['@typescript-eslint/no-unsafe-assignment', unsafeAnyMessage],
  ['@typescript-eslint/no-unsafe-call', unsafeAnyMessage],
  ['@typescript-eslint/no-unsafe-return', unsafeAnyMessage],
  ['@typescript-eslint/only-throw-error', onlyThrowErrorMessage],
  ['vitest/expect-expect', expectExpectMessage],
  ['jest/expect-expect', expectExpectMessage],
  ['node-test/expect-expect', expectExpectMessage],
  ['mocha/expect-expect', expectExpectMessage],
  ['@typescript-eslint/no-duplicate-type-constituents', duplicateConstituentsMessage],
  ['@typescript-eslint/switch-exhaustiveness-check', switchExhaustivenessMessage],
  ['@typescript-eslint/no-invalid-void-type', invalidVoidMessage],
  ['@typescript-eslint/no-floating-promises', floatingPromiseMessage],
  ['nitpicker/naming-convention', appendHint(NAMING_HINT)],
  ['@typescript-eslint/explicit-module-boundary-types', boundaryTypesMessage],
  ['no-eval', () => EVAL_MESSAGE],
  ['no-param-reassign', appendHint(PARAM_REASSIGN_HINT)],
  ['curly', appendHint(CURLY_HINT)],
  ['no-duplicate-imports', appendHint(DUPLICATE_IMPORT_HINT)],
  ['regexp/no-super-linear-backtracking', appendHint(REGEXP_HINT)],
]);

export function eslintMessageWithHint({ ruleId, text, relativePath, node, sourceFile }) {
  const rewrite = MESSAGE_REWRITERS.get(ruleId);
  return rewrite === undefined ? text : rewrite({ text, relativePath, node, sourceFile });
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

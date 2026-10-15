import { readLayout } from '../../preset/head-policy.mjs';
import { immutableTypesMessage } from './immutable-types-hint.mjs';

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

const NODE_TEST_HINT =
  ' nitpicker runs tests with Vitest only (Jest and node:test support is tracked in issue #162). If this file must stay on node:test, add an exception for this rule in nitpicker.config.json.';

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
  ['@typescript-eslint/no-duplicate-type-constituents', duplicateConstituentsMessage],
  ['@typescript-eslint/switch-exhaustiveness-check', switchExhaustivenessMessage],
  ['@typescript-eslint/no-invalid-void-type', invalidVoidMessage],
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

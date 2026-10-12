import { readLayout } from '../preset/head-policy.mjs';
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

const DOMAIN_PATH = /(?:^|\/)features\/[^/]+\/domain\//u;

const ONLY_THROW_ERROR_TEXT = 'Expected an error object to be thrown.';

const THROW_ERROR_HINT = 'Throw an Error subclass.';

const THROW_ERROR_TEST_HINT = `${THROW_ERROR_HINT} A test double that must throw a non-Error value types it \`unknown\`: \`const value: unknown = 7; throw value;\`.`;

const NO_ASSERTIONS_TEXT = 'Test has no assertions';

const NO_ASSERTIONS_HINT = `${NO_ASSERTIONS_TEXT}. Call \`expect\` in the test body: asserting helpers do not count, so return the value and \`expect\` it in the test.`;

const DUPLICATE_CONSTITUENTS_HINT =
  ' The members are now the same type: use the one type the feature exports (e.g. `import type { Message }`), not a `ReturnType<...>` alias.';

const SWITCH_NOT_EXHAUSTIVE_TEXT = 'Switch is not exhaustive';

const SWITCH_NOT_EXHAUSTIVE_HINT =
  '. If this function is already over a size limit, adding cases will fail the size check: extract an exhaustive helper instead (e.g. a `Record<Union, number>` lookup).';

const GROWTH_ADVICE = new Map([
  [
    'nitpicker/no-throw',
    'This function had {base} of these at base and the count may not grow: route the new failure through an existing throw statement, or return a union from a new helper function.',
  ],
]);

function immutableTypesRewrite({ text, node, sourceFile }) {
  const kind = IMMUTABLE_TYPES_PREFIX.exec(text)?.[1];
  return kind === undefined ? text : immutableTypesMessage({ kind, node, sourceFile });
}

function rejectErrorsMessage({ text, relativePath }) {
  return readLayout().isTestFile(relativePath) ? `${text}${REJECT_ERRORS_TEST_HINT}` : text;
}

function unsafeAnyMessage({ text, relativePath }) {
  if (UNRESOLVED_TYPE.test(text)) {
    return `${text}${UNRESOLVED_TYPE_HINT}`;
  }
  if (readLayout().isTestFile(relativePath)) {
    return `${text}${ASYMMETRIC_MATCHER_HINT}`;
  }
  return `${text}${DOMAIN_PATH.test(relativePath) ? DOMAIN_LEGACY_ANY_HINT : LEGACY_ANY_HINT}`;
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

function switchExhaustivenessMessage({ text }) {
  return text.startsWith(SWITCH_NOT_EXHAUSTIVE_TEXT)
    ? `${text}${SWITCH_NOT_EXHAUSTIVE_HINT}`
    : text;
}

const MESSAGE_REWRITERS = new Map([
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
]);

export function eslintMessageWithHint({ ruleId, text, relativePath, node, sourceFile }) {
  const rewrite = MESSAGE_REWRITERS.get(ruleId);
  return rewrite === undefined ? text : rewrite({ text, relativePath, node, sourceFile });
}

export function growthAdviceFor(ruleId) {
  return GROWTH_ADVICE.get(ruleId);
}

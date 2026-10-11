import { readLayout } from '../preset/head-policy.mjs';

const IMMUTABLE_TYPES_PREFIX =
  /^(Variable|Parameter|Return type|Property) should have an immutability of at least/u;

const READONLY_EXAMPLE = 'type it deeply readonly, e.g. `readonly T[]` or `{ readonly field: T }`';

const IMMUTABLE_TYPES_HINTS = new Map([
  [
    'Variable',
    'Variable is mutable, but domain/ values must be deeply readonly. Annotate arrays from map, filter or toSorted as `readonly T[]`. Type a Set as `ReadonlySet<T>`, or build it inline: `[...new Set(xs)]`. Give a callback that returns an object or array literal an explicit readonly return type. Zod schemas and RegExp objects are always mutable: keep schemas in adapters/ and write the regex literal inline where it is used.',
  ],
  ['Parameter', `Parameter is mutable: ${READONLY_EXAMPLE}.`],
  ['Return type', `Return type is mutable: ${READONLY_EXAMPLE}.`],
  ['Property', `Property is mutable: ${READONLY_EXAMPLE}.`],
]);

const REJECT_ERRORS_TEST_HINT =
  ' In tests, reject with `vi.fn().mockRejectedValue(value)` to use a non-Error reason.';

const UNSAFE_ANY_RULES = new Set([
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-return',
]);

const UNSAFE_ANY_HINT =
  ' Read fields of a legacy `any` value through one reader function whose parameter is `unknown` and that returns a typed object.';

const UNSAFE_ANY_JAVASCRIPT_HINT =
  ' Give the value a JSDoc type at its source (`@param {string} name`, `@returns {Type}`, `@type {Type}`), or read fields of a legacy `any` value through one reader function whose parameter is `{unknown}` and that returns a typed object.';

export function eslintMessageWithHint({ ruleId, text, relativePath }) {
  if (ruleId === 'functional/prefer-immutable-types') {
    const kind = IMMUTABLE_TYPES_PREFIX.exec(text)?.[1];
    return IMMUTABLE_TYPES_HINTS.get(kind) ?? text;
  }
  if (
    ruleId === '@typescript-eslint/prefer-promise-reject-errors' &&
    readLayout().isTestFile(relativePath)
  ) {
    return `${text}${REJECT_ERRORS_TEST_HINT}`;
  }
  if (UNSAFE_ANY_RULES.has(ruleId)) {
    return `${text}${readLayout().javascript ? UNSAFE_ANY_JAVASCRIPT_HINT : UNSAFE_ANY_HINT}`;
  }
  return text;
}

import { readLayout } from '../preset/head-policy.mjs';
import { immutableTypesMessage } from './immutable-types-hint.mjs';

const IMMUTABLE_TYPES_PREFIX =
  /^(Variable|Parameter|Return type|Property) should have an immutability of at least/u;

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

export function eslintMessageWithHint({ ruleId, text, relativePath, node, sourceFile }) {
  if (ruleId === 'functional/prefer-immutable-types') {
    const kind = IMMUTABLE_TYPES_PREFIX.exec(text)?.[1];
    return kind === undefined ? text : immutableTypesMessage({ kind, node, sourceFile });
  }
  if (
    ruleId === '@typescript-eslint/prefer-promise-reject-errors' &&
    readLayout().isTestFile(relativePath)
  ) {
    return `${text}${REJECT_ERRORS_TEST_HINT}`;
  }
  if (UNSAFE_ANY_RULES.has(ruleId)) {
    return `${text}${UNSAFE_ANY_HINT}`;
  }
  return text;
}

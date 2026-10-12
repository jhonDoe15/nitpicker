const nullLiteral = "Literal[raw='null']";
const strictEqualityOperand = 'BinaryExpression[operator=/^[!=]==$/] > Literal';
const jsonStringifyArgument =
  "CallExpression[callee.object.name='JSON'][callee.property.name='stringify'] > Literal";

const nullMessage =
  'Use `undefined` for an absent value. `null` is only for strict comparison with a library value and the `JSON.stringify` replacer argument.';

export const typeAssertionSelectors = [
  {
    selector: "TSAsExpression:not([typeAnnotation.typeName.name='const'])",
    message:
      'Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.',
  },
  {
    selector: 'TSTypeAssertion',
    message:
      'Do not assert with `<Type>value`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source.',
  },
];

export const escapeHatchSelectors = [
  ...typeAssertionSelectors,
  {
    selector: 'TSAnyKeyword',
    message:
      'Use `unknown` and parse it into a specific type at the boundary with zod, or write the specific type.',
  },
  {
    selector: 'TSNonNullExpression',
    message:
      'Do not use the non-null assertion `!`. Check for `undefined` and return early, or make the type non-optional at its source.',
  },
  {
    selector: `${nullLiteral}:not(${strictEqualityOperand}):not(${jsonStringifyArgument})`,
    message: nullMessage,
  },
  {
    selector: 'TSNullKeyword',
    message: `${nullMessage} Type it as optional with \`undefined\`.`,
  },
];

export const escapeHatchRules = {
  'nitpicker/no-comments': 'error',
};

export const escapeHatchLinterOptions = { noInlineConfig: true };

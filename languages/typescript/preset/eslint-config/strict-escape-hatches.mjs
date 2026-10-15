import { SYNTAX_EXCEPTION_HINT } from './rule-hints.mjs';

const nullLiteral = "Literal[raw='null']";
const strictEqualityOperand = 'BinaryExpression[operator=/^[!=]==$/] > Literal';
const jsonStringifyArgument =
  "CallExpression[callee.object.name='JSON'][callee.property.name='stringify'] > Literal";

const reactNullHost =
  'CallExpression:matches([callee.name=/^(useRef|createContext)$/], [callee.property.name=/^(useRef|createContext)$/])';

function nullMessageFor({ react }) {
  const reactForm = react ? ', and the `useRef` and `createContext` argument' : '';
  return `Use \`undefined\` for an absent value. \`null\` is only for strict comparison with a library value and the \`JSON.stringify\` replacer argument${reactForm}.${SYNTAX_EXCEPTION_HINT}`;
}

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

function except(allowed) {
  return allowed.map((selector) => `:not(${selector})`).join('');
}

export function nullSelectorsFor({ react = false } = {}) {
  const allowedNullLiterals = [
    strictEqualityOperand,
    jsonStringifyArgument,
    ...(react ? [`${reactNullHost} > Literal`] : []),
  ];
  const allowedNullTypes = react
    ? [`${reactNullHost} > TSTypeParameterInstantiation TSNullKeyword`]
    : [];
  return [
    {
      selector: `${nullLiteral}${except(allowedNullLiterals)}`,
      message: nullMessageFor({ react }),
    },
    {
      selector: `TSNullKeyword${except(allowedNullTypes)}`,
      message: `${nullMessageFor({ react })} Type it as optional with \`undefined\`.`,
    },
  ];
}

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
];

export const escapeHatchRules = {
  'nitpicker/no-comments': 'error',
};

export const escapeHatchLinterOptions = { noInlineConfig: true };

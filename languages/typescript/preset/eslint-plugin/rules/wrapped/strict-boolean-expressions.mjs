import tseslint from 'typescript-eslint';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { ancestorsOf } from '../analysis/ancestry.mjs';
import { withReportFilter } from './report-filter.mjs';

const baseRule = tseslint.plugin.rules['strict-boolean-expressions'];

const BIT_OPERATORS = new Set(['&', '|', '^', '<<', '>>', '>>>']);
const ARITHMETIC_OPERATORS = new Set(['-', '+', '*', '/', '%', '**']);
const ALWAYS_SETTLED = new Set(['conditionErrorObject', 'conditionErrorNullish']);
const COMPARATOR_NAME = /^(?:compare|localeCompare$)/u;

const NUMBER_FORMS =
  ' Compare it instead: `count > 0`, `index !== -1`, `items.length > 0`; for a default write `value ?? fallback`. An exception fits only when 0 must take the same path as a missing value.';

const NULLABLE_FORMS =
  ' Test the missing case and the number apart: `value !== undefined`, `value !== undefined && value > 0`, or `value ?? fallback` for a default. An exception fits only when 0 must take the same path as a missing value.';

const OTHER_FORMS =
  " Compare the value instead: `value !== undefined`, `count > 0`, `name !== ''`. An exception fits only when every falsy member must take the same path.";

function unwrapped(node) {
  return node.type === 'ChainExpression' ? node.expression : node;
}

function calleeName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : '';
}

function returnedValue(node) {
  const value = unwrapped(node);
  return value.type === 'ArrowFunctionExpression' && value.expression
    ? unwrapped(value.body)
    : value;
}

function isBitTest(node) {
  const value = returnedValue(node);
  return value.type === 'BinaryExpression' && BIT_OPERATORS.has(value.operator);
}

function isComparison(node) {
  const value = unwrapped(node);
  if (value.type === 'BinaryExpression') {
    return ARITHMETIC_OPERATORS.has(value.operator);
  }
  return value.type === 'CallExpression' && COMPARATOR_NAME.test(calleeName(value.callee));
}

function isLogical(node, operators) {
  return node?.type === 'LogicalExpression' && operators.includes(node.operator);
}

function orChainTop(node) {
  let top;
  for (const parent of ancestorsOf(node)) {
    if (!isLogical(parent, ['||'])) {
      return top;
    }
    top = parent;
  }
  return top;
}

function isComparatorChainLink(node) {
  const top = orChainTop(node);
  return top !== undefined && isComparison(node) && unwrapped(top.right).type !== 'Literal';
}

function isZero(node) {
  return node.type === 'Literal' && node.value === 0;
}

function fallsBackToZero(node) {
  let child = node;
  for (const parent of ancestorsOf(node)) {
    if (!isLogical(parent, ['||', '&&'])) {
      return false;
    }
    if (parent.operator === '||' && parent.left === child && isZero(parent.right)) {
      return true;
    }
    child = parent;
  }
  return false;
}

const UNTYPED = ts.TypeFlags.Any | ts.TypeFlags.Unknown;

function isUntyped(node, context) {
  return (context.sourceCode.parserServices.getTypeAtLocation(node).flags & UNTYPED) !== 0;
}

function keepsReport({ node, messageId }, context) {
  return !(
    ALWAYS_SETTLED.has(messageId) ||
    isBitTest(node) ||
    isComparatorChainLink(node) ||
    fallsBackToZero(node) ||
    isUntyped(node, context)
  );
}

const { messages } = baseRule.meta;

const filtered = withReportFilter(baseRule, keepsReport, {
  conditionErrorNumber: `Unexpected number value in {{context}}: 0 and NaN read as false.${NUMBER_FORMS}`,
  conditionErrorNullableNumber: `Unexpected nullable number value in {{context}}: 0 reads as missing.${NULLABLE_FORMS}`,
  conditionErrorNullableEnum: `${messages.conditionErrorNullableEnum}${NULLABLE_FORMS}`,
  conditionErrorOther: `${messages.conditionErrorOther}${OTHER_FORMS}`,
});

export const rule = {
  ...filtered,
  meta: {
    ...filtered.meta,
    docs: {
      ...filtered.meta.docs,
      description: 'Disallow testing a number for truthiness, where 0 reads as false or missing',
    },
  },
};

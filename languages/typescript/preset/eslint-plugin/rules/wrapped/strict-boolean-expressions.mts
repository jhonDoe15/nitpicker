import {
  AST_NODE_TYPES,
  ESLintUtils,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import tseslint from 'typescript-eslint';
import { ancestorsOf } from '../typed/node-views.mts';
import { calleeName } from '../typed/syntax-views.mts';
import { ts } from '../typed/typescript-views.mts';
import { pluginRule, reportedNode, withReportFilter, type Context } from './report-filter.mts';

type MessageId =
  | 'conditionFixCastBoolean'
  | 'conditionFixCompareArrayLengthNonzero'
  | 'conditionFixCompareArrayLengthZero'
  | 'conditionFixCompareEmptyString'
  | 'conditionFixCompareFalse'
  | 'conditionFixCompareNaN'
  | 'conditionFixCompareNullish'
  | 'conditionFixCompareStringLength'
  | 'conditionFixCompareTrue'
  | 'conditionFixCompareZero'
  | 'conditionFixDefaultEmptyString'
  | 'conditionFixDefaultFalse'
  | 'conditionFixDefaultZero'
  | 'explicitBooleanReturnType'
  | 'noStrictNullCheck'
  | 'predicateCannotBeAsync'
  | 'conditionErrorAny'
  | 'conditionErrorNullableBoolean'
  | 'conditionErrorNullableEnum'
  | 'conditionErrorNullableNumber'
  | 'conditionErrorNullableObject'
  | 'conditionErrorNullableString'
  | 'conditionErrorNullish'
  | 'conditionErrorNumber'
  | 'conditionErrorObject'
  | 'conditionErrorOther'
  | 'conditionErrorString';
type Options = readonly unknown[];

const baseRule = pluginRule<MessageId, Options, unknown>(
  tseslint.plugin,
  'strict-boolean-expressions',
);

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

function unwrapped(node: TSESTree.Node): TSESTree.Node {
  return node.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
}

function returnedValue(node: TSESTree.Node): TSESTree.Node {
  const value = unwrapped(node);
  return value.type === AST_NODE_TYPES.ArrowFunctionExpression && value.expression
    ? unwrapped(value.body)
    : value;
}

function isBitTest(node: TSESTree.Node): boolean {
  const value = returnedValue(node);
  return value.type === AST_NODE_TYPES.BinaryExpression && BIT_OPERATORS.has(value.operator);
}

function isComparison(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.BinaryExpression) {
    return ARITHMETIC_OPERATORS.has(value.operator);
  }
  return (
    value.type === AST_NODE_TYPES.CallExpression && COMPARATOR_NAME.test(calleeName(value.callee))
  );
}

function isLogical(
  node: TSESTree.Node | undefined,
  operators: readonly string[],
): node is TSESTree.LogicalExpression {
  return node?.type === AST_NODE_TYPES.LogicalExpression && operators.includes(node.operator);
}

function orChainTop(node: TSESTree.Node): TSESTree.LogicalExpression | undefined {
  let top: TSESTree.LogicalExpression | undefined;
  for (const parent of ancestorsOf(node)) {
    if (!isLogical(parent, ['||'])) {
      return top;
    }
    top = parent;
  }
  return top;
}

function isComparatorChainLink(node: TSESTree.Node): boolean {
  const top = orChainTop(node);
  return (
    top !== undefined && isComparison(node) && unwrapped(top.right).type !== AST_NODE_TYPES.Literal
  );
}

function isZero(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === 0;
}

function fallsBackToZero(node: TSESTree.Node): boolean {
  let child: TSESTree.Node = node;
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

function isUntyped(node: TSESTree.Node, context: Context<MessageId, Options>): boolean {
  return (ESLintUtils.getParserServices(context).getTypeAtLocation(node).flags & UNTYPED) !== 0;
}

function keepsReport(
  descriptor: TSESLint.ReportDescriptor<MessageId>,
  context: Context<MessageId, Options>,
): boolean {
  const node = reportedNode(descriptor);
  if (node === undefined) {
    return true;
  }
  return !(
    ALWAYS_SETTLED.has(descriptor.messageId) ||
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

export const rule: TSESLint.RuleModule<MessageId, Options> = {
  ...filtered,
  meta: {
    ...filtered.meta,
    docs: {
      ...filtered.meta.docs,
      description: 'Disallow testing a number for truthiness, where 0 reads as false or missing',
    },
  },
};

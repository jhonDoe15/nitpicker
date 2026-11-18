import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../rules/security/security-values.mts';
import { outerOf } from '../../rules/collections/costly-forms/repeated-runs.mts';
import { hasNeverFalsyItems } from '../../rules/support/array-items.mts';
import { allOf, type FixPlans } from '../edits/plans.mts';
import { hasCommentIn, inserting, replacing, type FixPlan } from '../support/ranges.mts';
import { startsFromSizedArray } from './support/fresh-arrays.mts';
import { isGlobalName } from './support/globals.mts';

const EQUALITY = new Set(['===', '!==', '==', '!=']);
const NEGATING = new Set(['===', '==']);

type Top = TSESTree.CallExpression | TSESTree.ChainExpression;
type Found = { readonly call: TSESTree.CallExpression; readonly receiver: TSESTree.Node };

function renaming(call: TSESTree.CallExpression): FixPlan | undefined {
  const { callee } = call;
  return callee.type === AST_NODE_TYPES.MemberExpression
    ? replacing(callee.property.range, 'some')
    : undefined;
}

function comparison(
  context: Context,
  top: Top,
  binary: TSESTree.BinaryExpression,
): FixPlan[] | undefined {
  const { sourceCode } = context;
  const operator = sourceCode.getFirstTokenBetween(
    binary.left,
    binary.right,
    (token) => token.value === binary.operator,
  );
  const before = operator === null ? null : sourceCode.getTokenBefore(operator);
  const after = operator === null ? null : sourceCode.getTokenAfter(operator);
  if (before === null || after === null || top.type === AST_NODE_TYPES.ChainExpression) {
    return undefined;
  }
  const negation = NEGATING.has(binary.operator) ? '!' : '';
  const callOnLeft = binary.left === top;
  const removed: TSESTree.Range = callOnLeft
    ? [before.range[1], binary.range[1]]
    : [binary.range[0], after.range[0]];
  if (hasCommentIn(sourceCode, removed)) {
    return undefined;
  }
  return callOnLeft
    ? [inserting(binary.range[0], negation), replacing(removed, '')]
    : [replacing(removed, negation)];
}

function isNothing(context: Context, node: TSESTree.Node, operator: string): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === 'undefined' && isGlobalName(context, node, 'undefined');
  }
  return node.type === AST_NODE_TYPES.Literal && node.value === null && operator.length === 2;
}

function plansFor(context: Context, call: TSESTree.CallExpression): FixPlan[] | undefined {
  const top: Top = call.parent.type === AST_NODE_TYPES.ChainExpression ? call.parent : call;
  const { parent } = top;
  if (outerOf(call) !== top) {
    return undefined;
  }
  if (parent.type === AST_NODE_TYPES.BinaryExpression && EQUALITY.has(parent.operator)) {
    const other = parent.left === top ? parent.right : parent.left;
    return isNothing(context, other, parent.operator)
      ? comparison(context, top, parent)
      : undefined;
  }
  if (parent.type === AST_NODE_TYPES.CallExpression && !isGlobalName(context, parent, 'Boolean')) {
    return undefined;
  }
  return [];
}

export function findBooleanFix(context: Context, { call, receiver }: Found): FixPlans | undefined {
  const rename = renaming(call);
  const plans = call.typeArguments === undefined ? plansFor(context, call) : undefined;
  const proven =
    rename !== undefined &&
    plans !== undefined &&
    !startsFromSizedArray(receiver) &&
    hasNeverFalsyItems(context, receiver) === 'yes';
  return proven ? allOf([rename, ...plans]) : undefined;
}

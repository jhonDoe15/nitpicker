import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../rules/security/security-values.mts';
import { hasSingleItemType } from '../../rules/support/array-items.mts';
import { hasArrayType } from '../../rules/support/checked-types.mts';
import { allOf, type FixPlans } from '../edits/plans.mts';
import { hasCommentIn, replacing } from '../support/ranges.mts';

function isPlainMap(map: TSESTree.CallExpression): map is TSESTree.CallExpression & {
  callee: TSESTree.MemberExpression;
} {
  return (
    map.callee.type === AST_NODE_TYPES.MemberExpression &&
    !map.optional &&
    !map.callee.computed &&
    map.typeArguments === undefined &&
    map.arguments.length >= 1 &&
    map.arguments.length <= 2 &&
    map.arguments.every((argument) => argument.type !== AST_NODE_TYPES.SpreadElement)
  );
}

function isPlainFlat(flat: TSESTree.CallExpression, map: TSESTree.CallExpression): boolean {
  const { callee } = flat;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object === map &&
    !callee.optional &&
    !callee.computed &&
    !flat.optional &&
    flat.typeArguments === undefined
  );
}

export function mapFlatFix(
  context: Context,
  flat: TSESTree.CallExpression,
  map: TSESTree.CallExpression,
): FixPlans | undefined {
  const { sourceCode } = context;
  const separator = sourceCode.getTokenAfter(map);
  if (!isPlainMap(map) || !isPlainFlat(flat, map) || separator?.value !== '.') {
    return undefined;
  }
  const tail: TSESTree.Range = [map.range[1], flat.range[1]];
  const proven =
    !hasCommentIn(sourceCode, tail) &&
    hasArrayType(context, map.callee.object) === 'yes' &&
    hasSingleItemType(context, map);
  return proven
    ? allOf([replacing(map.callee.property.range, 'flatMap'), replacing(tail, '')])
    : undefined;
}

import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';

export const LOOP_TYPES = new Set<string>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

function isNumber(node: TSESTree.Node | undefined): boolean {
  const literal =
    node?.type === AST_NODE_TYPES.UnaryExpression && node.operator === '-' ? node.argument : node;
  return literal?.type === AST_NODE_TYPES.Literal && typeof literal.value === 'number';
}

function isBoundingSlice(array: TSESTree.ArrayExpression): boolean {
  const member = array.parent;
  const call = member.parent;
  if (
    member.type !== AST_NODE_TYPES.MemberExpression ||
    member.object !== array ||
    member.computed ||
    nameOf(member.property) !== 'slice' ||
    call?.type !== AST_NODE_TYPES.CallExpression ||
    call.callee !== member
  ) {
    return false;
  }
  const [start, end] = call.arguments;
  return call.arguments.length === 2
    ? isNumber(start) && isNumber(end)
    : call.arguments.length === 1 &&
        start?.type === AST_NODE_TYPES.UnaryExpression &&
        isNumber(start);
}

export function isFixedShape(spread: TSESTree.SpreadElement): boolean {
  const container = spread.parent;
  if (container.type === AST_NODE_TYPES.ObjectExpression) {
    return container.properties.every(
      (property) =>
        property === spread || (property.type === AST_NODE_TYPES.Property && !property.computed),
    );
  }
  return container.type === AST_NODE_TYPES.ArrayExpression && isBoundingSlice(container);
}

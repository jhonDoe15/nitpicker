import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, type Ranged } from '../../typed/node-views.mts';

const LOOPS = new Set<string>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

function contains(outer: Ranged, inner: Ranged): boolean {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

function inDifferentArms(write: TSESTree.Node, mutation: Ranged): boolean {
  return ancestorsOf(write).some((ancestor) => {
    if (ancestor.type !== AST_NODE_TYPES.IfStatement) {
      return false;
    }
    const { consequent, alternate } = ancestor;
    return (
      alternate !== null &&
      ((contains(consequent, write) && contains(alternate, mutation)) ||
        (contains(alternate, write) && contains(consequent, mutation)))
    );
  });
}

function sharesLoop(write: TSESTree.Node, mutation: Ranged): boolean {
  return ancestorsOf(write).some(
    (ancestor) => LOOPS.has(ancestor.type) && contains(ancestor, mutation),
  );
}

export function isOffPath(write: TSESTree.Node, mutation: Ranged): boolean {
  if (inDifferentArms(write, mutation)) {
    return !sharesLoop(write, mutation);
  }
  return write.range[0] > mutation.range[1] && !sharesLoop(write, mutation);
}

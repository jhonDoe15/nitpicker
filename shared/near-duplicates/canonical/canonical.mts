import { chainOf } from '../../traversal.mts';
import { parameterPositions, shapeMode } from '../tree/keys.mts';
import { categoryOf, present, rebuild, sameTree, withChildren } from '../tree/nodes.mts';
import { normalizeTree } from '../tree/shape.mts';
import { escapingNames } from './effects.mts';
import {
  chainInteriors,
  markConditions,
  rewriteExpression,
  withConditions,
} from './expressions.mts';
import { canonicalOrder } from './order.mts';
import type { OrderContext } from './order.mts';
import { rewriteStatements } from './statements.mts';
import type { TreeNode } from '../tree/tree-types.mts';

export type CanonicalTree = {
  readonly tree: TreeNode;
  readonly original: TreeNode;
  readonly rewritten: boolean;
};

type Round = { readonly tree: TreeNode; readonly round: number };

const MAX_ROUNDS = 8;

function rewrite(root: TreeNode, context: OrderContext): TreeNode {
  const interiors = chainInteriors(root);
  return rebuild(root, (node, children) => {
    const rebuilt = withConditions(node, children);
    if (rebuilt.kind === 'block') {
      return withChildren(rebuilt, canonicalOrder(rewriteStatements(children), context));
    }
    return categoryOf(rebuilt) === 'expression' && !interiors.has(node)
      ? rewriteExpression(rebuilt, context.mode)
      : rebuilt;
  });
}

export function canonicalTree(tree: TreeNode): CanonicalTree {
  const original = normalizeTree(tree);
  const context = {
    escaping: escapingNames(original),
    mode: shapeMode(parameterPositions(original)),
  };
  const start = markConditions(original);
  const rounds = chainOf<Round>({ tree: start, round: 0 }, ({ tree: current, round }) => {
    if (round >= MAX_ROUNDS) {
      return undefined;
    }
    const next = rewrite(current, context);
    return sameTree(next, current) ? undefined : { tree: next, round: round + 1 };
  });
  const current = present(rounds.at(-1)).tree;
  return { tree: current, original, rewritten: !sameTree(current, start) };
}

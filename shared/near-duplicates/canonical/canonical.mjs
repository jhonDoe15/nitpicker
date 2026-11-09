import { chainOf } from '../../traversal.mjs';
import { parameterPositions, shapeMode } from '../tree/keys.mjs';
import { categoryOf, rebuild, sameTree, withChildren } from '../tree/nodes.mjs';
import { normalizeTree } from '../tree/shape.mjs';
import { escapingNames } from './effects.mjs';
import {
  chainInteriors,
  markConditions,
  rewriteExpression,
  withConditions,
} from './expressions.mjs';
import { canonicalOrder } from './order.mjs';
import { rewriteStatements } from './statements.mjs';

const MAX_ROUNDS = 8;

function rewrite(root, context) {
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

export function canonicalTree(tree) {
  const original = normalizeTree(tree);
  const context = {
    escaping: escapingNames(original),
    mode: shapeMode(parameterPositions(original)),
  };
  const start = markConditions(original);
  const rounds = chainOf({ tree: start, round: 0 }, ({ tree: current, round }) => {
    if (round >= MAX_ROUNDS) {
      return undefined;
    }
    const next = rewrite(current, context);
    return sameTree(next, current) ? undefined : { tree: next, round: round + 1 };
  });
  const current = rounds.at(-1).tree;
  return { tree: current, rewritten: !sameTree(current, start) };
}

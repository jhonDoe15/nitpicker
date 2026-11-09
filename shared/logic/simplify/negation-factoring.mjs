import { depthFirst, foldTree } from '../../traversal.mjs';
import { isLogical, isNot, logical, not, withChildren, withRange } from '../terms.mjs';

const FLIPPED = new Map([
  ['&&', '||'],
  ['||', '&&'],
]);

function chainOperands(root, operator) {
  const nodes = [...depthFirst(root, (node) => (isLogical(node, operator) ? node.children : []))];
  return nodes.filter((node) => !isLogical(node, operator));
}

function factored(node) {
  const operands = chainOperands(node, node.value);
  if (!operands.every(isNot)) {
    return undefined;
  }
  const inner = operands
    .map((operand) => operand.children[0])
    .reduce((left, right) => logical(FLIPPED.get(node.value), [left, right], node.range));
  return not(withRange(inner, node.range), node.range);
}

function isChainRoot(node, parentOperator) {
  return FLIPPED.has(node.value) && node.kind === 'logical' && parentOperator !== node.value;
}

export function factorNegations(root) {
  const rewrites = [];
  const result = foldTree(root, undefined, {
    expand: (node) =>
      node.children.map((child) => [child, node.kind === 'logical' ? node.value : undefined]),
    combine: (node, parentOperator, children) => {
      const rebuilt = withChildren(node, children);
      const negated = isChainRoot(rebuilt, parentOperator) ? factored(rebuilt) : undefined;
      if (negated === undefined) {
        return rebuilt;
      }
      rewrites.push({ rewrite: 'negation-factoring', range: node.range });
      return negated;
    },
  });
  return { term: result, rewrites };
}

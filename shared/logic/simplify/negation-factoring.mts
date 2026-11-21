import { depthFirst, foldTree } from '../../traversal.mts';
import { isLogical, isNot, logical, not, withChildren, withRange } from '../terms.mts';
import type { AppliedRewrite, Term } from '../typed/term-types.mts';

const FLIPPED = new Map<string | undefined, string>([
  ['&&', '||'],
  ['||', '&&'],
]);

function chainOperands(root: Term, operator: string | undefined): Term[] {
  const nodes = [
    ...depthFirst(root, (node: Term): Term[] => (isLogical(node, operator) ? node.children : [])),
  ];
  return nodes.filter((node) => !isLogical(node, operator));
}

function factored(node: Term): Term | undefined {
  const operands = chainOperands(node, node.value);
  if (!operands.every(isNot)) {
    return undefined;
  }
  const inner = operands
    .flatMap((operand) => operand.children.slice(0, 1))
    .reduce((left, right) => logical(FLIPPED.get(node.value), [left, right], node.range));
  return not(withRange(inner, node.range), node.range);
}

function isChainRoot(node: Term, parentOperator: string | undefined): boolean {
  return FLIPPED.has(node.value) && node.kind === 'logical' && parentOperator !== node.value;
}

export function factorNegations(root: Term): {
  readonly term: Term;
  readonly rewrites: AppliedRewrite[];
} {
  const rewrites: AppliedRewrite[] = [];
  const result = foldTree(root, undefined, {
    expand: (node: Term) =>
      node.children.map((child): [Term, string | undefined] => [
        child,
        node.kind === 'logical' ? node.value : undefined,
      ]),
    combine: (node: Term, parentOperator: string | undefined, children: Term[]) => {
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

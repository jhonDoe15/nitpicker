import { depthFirst, foldTree } from '../../traversal.mts';
import { isLogical, isNot, key, logical, not } from '../terms.mts';
import { required } from '../typed/term-parts.mts';
import type { Chain, Leaf, Negation, Skeleton, SkeletonSource } from '../typed/skeleton-types.mts';
import type { Term } from '../typed/term-types.mts';

const DUAL = { and: 'or', or: 'and' } as const;

function leafOf(term: Term, text: string): Leaf {
  return { op: 'leaf', term, text };
}

export function dualOf(op: Chain['op']): Chain['op'] {
  return DUAL[op];
}

function flattened(op: Chain['op'], kids: Skeleton[]): Skeleton[] {
  return kids.flatMap((kid) => (kid.op === op ? kid.kids : [kid]));
}

export function chain(op: Chain['op'], kids: Skeleton[]): Skeleton {
  const parts = flattened(op, kids);
  const [only] = parts;
  return parts.length === 1 && only !== undefined ? only : { op, kids: parts };
}

export function negation(kid: Skeleton): Negation {
  return { op: 'not', kid };
}

function isConnective(term: Term): boolean {
  return isLogical(term, '&&') || isLogical(term, '||') || isNot(term);
}

function combined(term: Term, kids: Skeleton[]): Skeleton {
  if (isNot(term)) {
    return negation(required(kids[0], 'operand of a negation'));
  }
  return chain(term.value === '||' ? 'or' : 'and', kids);
}

export function skeletonOf<Context>(root: Term, source: SkeletonSource<Context>): Skeleton {
  return foldTree(root, source.rootContext, {
    expand: (term: Term, context: Context) =>
      isConnective(term)
        ? term.children.map((child, index): [Term, Context] => [
            child,
            source.children(context, index),
          ])
        : [],
    combine: (term: Term, context: Context, kids: Skeleton[]): Skeleton =>
      isConnective(term) ? combined(term, kids) : leafOf(term, source.text(term, context)),
  });
}

function kidsOfNode(node: Skeleton): Skeleton[] {
  if (node.op === 'leaf') {
    return [];
  }
  return node.op === 'not' ? [node.kid] : node.kids;
}

export function leavesOf(root: Skeleton): Leaf[] {
  return [...depthFirst(root, kidsOfNode)].filter((node): node is Leaf => node.op === 'leaf');
}

export function termOfSkeleton(root: Skeleton): Term {
  return foldTree(root, undefined, {
    expand: (node: Skeleton) =>
      kidsOfNode(node).map((kid): [Skeleton, undefined] => [kid, undefined]),
    combine: (node: Skeleton, _context: undefined, results: Term[]): Term => {
      if (node.op === 'leaf') {
        return node.term;
      }
      if (node.op === 'not') {
        return not(required(results[0], 'operand of a negation'));
      }
      const operator = node.op === 'and' ? '&&' : '||';
      return results.reduce((left, right) => logical(operator, [left, right]));
    },
  });
}

export function skeletonKey(root: Skeleton): string {
  return key(termOfSkeleton(root));
}

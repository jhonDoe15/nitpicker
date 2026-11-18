import { depthFirst, foldTree } from '../../traversal.mjs';
import { isLogical, isNot, key, logical, not } from '../terms.mjs';

const DUAL = { and: 'or', or: 'and' };
const OPERATORS = { '&&': 'and', '||': 'or' };

function leafOf(term, text) {
  return { op: 'leaf', term, text };
}

export function dualOf(op) {
  return DUAL[op];
}

function flattened(op, kids) {
  return kids.flatMap((kid) => (kid.op === op ? kid.kids : [kid]));
}

export function chain(op, kids) {
  const parts = flattened(op, kids);
  return parts.length === 1 ? parts[0] : { op, kids: parts };
}

export function negation(kid) {
  return { op: 'not', kid };
}

function isConnective(term) {
  return isLogical(term, '&&') || isLogical(term, '||') || isNot(term);
}

function combined(term, kids) {
  if (isNot(term)) {
    return negation(kids[0]);
  }
  return chain(OPERATORS[term.value], kids);
}

/**
 * The `&&`/`||`/`!` skeleton of a condition term: same-operator chains are flat, every other part is a
 * leaf. `source` pairs each term with what prints it: `children(term, context)` gives the context of
 * each child, `text(term, context)` the leaf's source text.
 */
export function skeletonOf(root, source) {
  return foldTree(root, source.rootContext, {
    expand: (term, context) =>
      isConnective(term)
        ? term.children.map((child, index) => [child, source.children(context, index)])
        : [],
    combine: (term, context, kids) =>
      isConnective(term) ? combined(term, kids) : leafOf(term, source.text(term, context)),
  });
}

function kidsOfNode(node) {
  if (node.op === 'leaf') {
    return [];
  }
  return node.op === 'not' ? [node.kid] : node.kids;
}

export function leavesOf(root) {
  return [...depthFirst(root, kidsOfNode)].filter((node) => node.op === 'leaf');
}

export function termOfSkeleton(root) {
  return foldTree(root, undefined, {
    expand: (node) => kidsOfNode(node).map((kid) => [kid]),
    combine: (node, _context, results) => {
      if (node.op === 'leaf') {
        return node.term;
      }
      if (node.op === 'not') {
        return not(results[0]);
      }
      const operator = node.op === 'and' ? '&&' : '||';
      return results.reduce((left, right) => logical(operator, [left, right]));
    },
  });
}

export function skeletonKey(root) {
  return key(termOfSkeleton(root));
}

import { foldTree } from '../../traversal.mjs';

export const C_STYLE = { and: ' && ', or: ' || ', not: '!' };
export const PYTHON_STYLE = { and: ' and ', or: ' or ', not: 'not ' };

const SIMPLE = new Set(['name', 'literal', 'this', 'member', 'index', 'call']);
const LOOSE = new Set(['conditional', 'opaque', 'assign', 'lambda']);

function leafText(leaf, isNegated) {
  const { kind } = leaf.term;
  const isLoose = LOOSE.has(kind) || (isNegated && !SIMPLE.has(kind));
  return isLoose ? `(${leaf.text})` : leaf.text;
}

function parts(node) {
  if (node.op === 'leaf') {
    return [];
  }
  return node.op === 'not' ? [[node.kid, node.op]] : node.kids.map((kid) => [kid, node.op]);
}

function negatedText(inner) {
  if (inner.op === 'leaf') {
    return leafText(inner.leaf, true);
  }
  return inner.op === 'not' ? inner.text : `(${inner.text})`;
}

/** The condition `skeleton` as source text in `style`, parenthesizing what the operators need. */
export function renderSkeleton(skeleton, style = C_STYLE) {
  const wrapped = foldTree(skeleton, undefined, {
    expand: (node) => parts(node),
    combine: (node, _context, results) => {
      if (node.op === 'leaf') {
        return { text: leafText(node, false), op: 'leaf', leaf: node };
      }
      if (node.op === 'not') {
        return { text: `${style.not}${negatedText(results[0])}`, op: 'not' };
      }
      const texts = results.map(({ text, op }) =>
        op === 'or' && node.op === 'and' ? `(${text})` : text,
      );
      return { text: texts.join(style[node.op]), op: node.op };
    },
  });
  return wrapped.text;
}

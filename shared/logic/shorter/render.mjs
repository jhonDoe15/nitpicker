import { foldTree } from '../../traversal.mjs';

export const C_STYLE = { and: ' && ', or: ' || ', not: '!' };
export const PYTHON_STYLE = { and: ' and ', or: ' or ', not: 'not ' };

const SIMPLE = new Set(['name', 'literal', 'this', 'member', 'index', 'call']);
const LOOSE = new Set(['conditional', 'opaque', 'assign', 'lambda']);

function isSimple({ kind, value }) {
  return SIMPLE.has(kind) && !(kind === 'name' && String(value).startsWith('#'));
}

function leafText(leaf, isNegated, textOf) {
  const isLoose = LOOSE.has(leaf.term.kind) || (isNegated && !isSimple(leaf.term));
  const text = textOf(leaf);
  return isLoose ? `(${text})` : text;
}

function parts(node) {
  if (node.op === 'leaf') {
    return [];
  }
  return node.op === 'not' ? [[node.kid, node.op]] : node.kids.map((kid) => [kid, node.op]);
}

function negatedText(inner, textOf) {
  if (inner.op === 'leaf') {
    return leafText(inner.leaf, true, textOf);
  }
  return inner.op === 'not' ? inner.text : `(${inner.text})`;
}

/**
 * The condition `skeleton` as source text in `style`, parenthesizing what the operators need;
 * `textOf` gives the text of a leaf.
 */
export function renderSkeleton(skeleton, style = C_STYLE, textOf = (leaf) => leaf.text) {
  const wrapped = foldTree(skeleton, undefined, {
    expand: (node) => parts(node),
    combine: (node, _context, results) => {
      if (node.op === 'leaf') {
        return { text: leafText(node, false, textOf), op: 'leaf', leaf: node };
      }
      if (node.op === 'not') {
        return { text: `${style.not}${negatedText(results[0], textOf)}`, op: 'not' };
      }
      const texts = results.map(({ text, op }) =>
        op === 'or' && node.op === 'and' ? `(${text})` : text,
      );
      return { text: texts.join(style[node.op]), op: node.op };
    },
  });
  return wrapped.text;
}

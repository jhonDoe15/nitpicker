import { foldTree } from '../../traversal.mts';
import { required } from '../typed/term-parts.mts';
import type { Leaf, Skeleton, Style } from '../typed/skeleton-types.mts';
import type { Term } from '../typed/term-types.mts';

type Rendered =
  | { readonly text: string; readonly op: 'leaf'; readonly leaf: Leaf }
  | { readonly text: string; readonly op: 'not' | 'and' | 'or' };

export const C_STYLE: Style = { and: ' && ', or: ' || ', not: '!' };
export const PYTHON_STYLE: Style = { and: ' and ', or: ' or ', not: 'not ' };

const SIMPLE = new Set(['name', 'literal', 'this', 'member', 'index', 'call']);
const LOOSE = new Set(['conditional', 'opaque', 'assign', 'lambda']);

function isSimple({ kind, value }: Term): boolean {
  return SIMPLE.has(kind) && !(kind === 'name' && String(value).startsWith('#'));
}

function leafText(leaf: Leaf, isNegated: boolean, textOf: (leaf: Leaf) => string): string {
  const isLoose = LOOSE.has(leaf.term.kind) || (isNegated && !isSimple(leaf.term));
  const text = textOf(leaf);
  return isLoose ? `(${text})` : text;
}

function parts(node: Skeleton): [Skeleton, undefined][] {
  if (node.op === 'leaf') {
    return [];
  }
  return node.op === 'not'
    ? [[node.kid, undefined]]
    : node.kids.map((kid): [Skeleton, undefined] => [kid, undefined]);
}

function negatedText(inner: Rendered, textOf: (leaf: Leaf) => string): string {
  if (inner.op === 'leaf') {
    return leafText(inner.leaf, true, textOf);
  }
  return inner.op === 'not' ? inner.text : `(${inner.text})`;
}

export function renderSkeleton(
  skeleton: Skeleton,
  style: Style = C_STYLE,
  textOf: (leaf: Leaf) => string = (leaf) => leaf.text,
): string {
  const wrapped = foldTree(skeleton, undefined, {
    expand: (node: Skeleton) => parts(node),
    combine: (node: Skeleton, _context: undefined, results: Rendered[]): Rendered => {
      if (node.op === 'leaf') {
        return { text: leafText(node, false, textOf), op: 'leaf', leaf: node };
      }
      if (node.op === 'not') {
        return {
          text: `${style.not}${negatedText(required(results[0], 'operand of a negation'), textOf)}`,
          op: 'not',
        };
      }
      const texts = results.map(({ text, op }) =>
        op === 'or' && node.op === 'and' ? `(${text})` : text,
      );
      return { text: texts.join(style[node.op]), op: node.op };
    },
  });
  return wrapped.text;
}

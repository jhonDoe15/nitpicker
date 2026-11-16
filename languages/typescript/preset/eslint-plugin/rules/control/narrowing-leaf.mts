import { chainOf } from '../typed/node-views.mts';
import { foldTerm, key, type Term } from '../analysis/logic/term-views.mts';

type Leaf = { readonly term: Term };

const REFERENCES = new Set(['name', 'member', 'index', 'this']);
const EQUALITIES = new Set(['===', '!==', '==', '!=']);

function isNegation(term: Term): boolean {
  return term.kind === 'unary' && term.value === '!';
}

function strippedOfNegations(term: Term): Term {
  return (
    chainOf(term, (current) => (isNegation(current) ? current.children[0] : undefined)).at(-1) ??
    term
  );
}

function bareReference(term: Term): Term | undefined {
  const stripped = strippedOfNegations(term);
  return REFERENCES.has(stripped.kind) ? stripped : undefined;
}

function isReference(term: Term): boolean {
  return bareReference(term) !== undefined;
}

function usedBeyondTruthiness(reference: Term, others: readonly Leaf[]): boolean {
  const wanted = key(reference);
  return others.some(({ term }) =>
    foldTerm<boolean>(term, (node, inner) => {
      const isBare = bareReference(node) !== undefined;
      return (
        (!isBare && node.children.some((child) => key(child) === wanted)) || inner.some(Boolean)
      );
    }),
  );
}

function isNullish(term: Term): boolean {
  return (
    (term.kind === 'literal' && term.value === 'null') ||
    (term.kind === 'name' && term.value === 'undefined')
  );
}

function isTypeof(term: Term): boolean {
  return term.kind === 'unary' && term.value === 'typeof';
}

/**
 * Whether TypeScript narrows on the condition `term` itself: a truthiness test of one reference
 * that other operands use, one compared with `null` or `undefined`, or a `typeof` test. Dropping it
 * could change a later operand's type.
 */
export function isNarrowingLeaf({ term }: Leaf, leaves: readonly Leaf[]): boolean {
  const reference = bareReference(term);
  if (reference !== undefined) {
    return usedBeyondTruthiness(
      reference,
      leaves.filter((leaf) => leaf.term !== term),
    );
  }
  if (term.kind !== 'binary' || term.value === undefined || !EQUALITIES.has(term.value)) {
    return false;
  }
  const sides = term.children;
  return (sides.some(isNullish) && sides.some(isReference)) || sides.some(isTypeof);
}

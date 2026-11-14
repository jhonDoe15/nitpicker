import { foldTerm, key } from '../../../../../../shared/logic/terms.mjs';

const REFERENCES = new Set(['name', 'member', 'index', 'this']);
const EQUALITIES = new Set(['===', '!==', '==', '!=']);

function bareReference(term) {
  let current = term;
  while (current.kind === 'unary' && current.value === '!') {
    current = current.children[0];
  }
  return REFERENCES.has(current.kind) ? current : undefined;
}

function isReference(term) {
  return bareReference(term) !== undefined;
}

function usedBeyondTruthiness(reference, others) {
  const wanted = key(reference);
  return others.some(({ term }) =>
    foldTerm(term, (node, inner) => {
      const isBare = bareReference(node) !== undefined;
      return (
        (!isBare && node.children.some((child) => key(child) === wanted)) || inner.some(Boolean)
      );
    }),
  );
}

function isNullish(term) {
  return (
    (term.kind === 'literal' && term.value === 'null') ||
    (term.kind === 'name' && term.value === 'undefined')
  );
}

function isTypeof(term) {
  return term.kind === 'unary' && term.value === 'typeof';
}

/**
 * Whether TypeScript narrows on the condition `term` itself: a truthiness test of one reference
 * that other operands use, one compared with `null` or `undefined`, or a `typeof` test. Dropping it
 * could change a later operand's type.
 */
export function isNarrowingLeaf({ term }, leaves) {
  const reference = bareReference(term);
  if (reference !== undefined) {
    return usedBeyondTruthiness(
      reference,
      leaves.filter((leaf) => leaf.term !== term),
    );
  }
  if (term.kind !== 'binary' || !EQUALITIES.has(term.value)) {
    return false;
  }
  const sides = term.children;
  return (sides.some(isNullish) && sides.some(isReference)) || sides.some(isTypeof);
}

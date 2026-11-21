import { normalize } from '../normalize.mts';
import { print } from '../print.mts';
import { key, term, withChildren } from '../terms.mts';
import { factorNegations } from './negation-factoring.mts';
import { sameRange, SIMPLER_REWRITES } from './simpler-rewrites.mts';
import { appendAll } from '../../lists/lists.mts';
import type { AppliedRewrite, Range, Term } from '../typed/term-types.mts';

type Found = {
  readonly range: Range;
  readonly term: Term;
  readonly form: string;
  readonly swapped: boolean;
};

const MAX_ROUNDS = 20;
const ROUNDS = Array.from({ length: MAX_ROUNDS }, (_, index) => index);
const ELIDED = term('block', undefined, [term('statement', '…')]);

function simplify(
  node: Term,
  booleanContext: boolean,
): { readonly term: Term; readonly rewrites: AppliedRewrite[] } {
  const rewrites: AppliedRewrite[] = [];
  let current = node;
  ROUNDS.some(() => {
    const normal = normalize(current, { booleanContext, rewrites: SIMPLER_REWRITES });
    const factored = factorNegations(normal.term);
    appendAll(rewrites, [...normal.rewrites, ...factored.rewrites]);
    current = factored.term;
    return factored.rewrites.length === 0;
  });
  return { term: current, rewrites };
}

function samePlaces(before: Term, after: Term): boolean {
  return (
    before.kind === after.kind &&
    before.value === after.value &&
    before.children.length === after.children.length &&
    before.children.every((child, index) => sameRange(child.range, after.children[index]?.range))
  );
}

function blockPairs(before: Term, after: Term, found: Term[]): [Term, Term][] {
  return after.children.flatMap((child): [Term, Term][] => {
    const match = before.children.find(({ range }) => sameRange(range, child.range));
    if (match === undefined) {
      found.push(child);
      return [];
    }
    return [[match, child]];
  });
}

function nextPairs(left: Term, right: Term, found: Term[]): [Term, Term][] {
  if (left.kind === 'block' && right.kind === 'block') {
    return blockPairs(left, right, found);
  }
  if (samePlaces(left, right)) {
    return left.children.flatMap((child, index): [Term, Term][] => {
      const other = right.children[index];
      return other === undefined ? [] : [[child, other]];
    });
  }
  found.push(right);
  return [];
}

function differences(before: Term, after: Term): Term[] {
  const found: Term[] = [];
  const pending: [Term, Term][] = [[before, after]];
  for (const [left, right] of pending) {
    if (key(left) !== key(right)) {
      appendAll(pending, nextPairs(left, right, found));
    }
  }
  return found;
}

function compact(node: Term): Term {
  return node.kind === 'if'
    ? withChildren(
        node,
        node.children.map((child) => (child.kind === 'block' ? ELIDED : child)),
      )
    : node;
}

export function simplerForms(
  root: Term,
  { booleanContext }: { readonly booleanContext: boolean } = { booleanContext: false },
): Found[] {
  const { term: simpler, rewrites } = simplify(root, booleanContext);
  return differences(root, simpler).flatMap((node): Found[] =>
    node.range === undefined
      ? []
      : [
          {
            range: node.range,
            term: node,
            form: print(compact(node)),
            swapped:
              rewrites.filter(
                ({ rewrite, range }) =>
                  rewrite === 'negated-condition' && sameRange(range, node.range),
              ).length %
                2 ===
              1,
          },
        ],
  );
}

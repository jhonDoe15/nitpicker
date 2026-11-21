import type { Term } from './term-types.mts';

export function pairOf(node: Term): [Term, Term] | undefined {
  const [first, second] = node.children;
  return first === undefined || second === undefined ? undefined : [first, second];
}

export function operatorPairOf(
  node: Term,
  operators: { has(operator: string | undefined): boolean },
): [Term, Term] | undefined {
  const operands = pairOf(node);
  return node.kind === 'binary' && operators.has(node.value) ? operands : undefined;
}

export function tripleOf(node: Term): [Term, Term, Term] | undefined {
  const [first, second, third] = node.children;
  return first === undefined || second === undefined || third === undefined
    ? undefined
    : [first, second, third];
}

export function required<Item>(item: Item | undefined, description: string): Item {
  if (item === undefined) {
    throw new TypeError(`Missing ${description}`);
  }
  return item;
}

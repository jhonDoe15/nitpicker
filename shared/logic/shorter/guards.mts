import { pureCallKind, isSideEffectFree } from '../purity.mts';
import { foldTerm, isBooleanValued, key } from '../terms.mts';
import { leavesOf } from './skeleton.mts';
import type { Guard, Leaf, Skeleton } from '../typed/skeleton-types.mts';
import type { Term } from '../typed/term-types.mts';

type Fact = { readonly keys: ReadonlySet<string>; readonly bases: Term[] };
export type GuardOptions = {
  readonly booleanContext: boolean;
  readonly isPinned?: (leaf: Leaf, leaves: readonly Leaf[]) => boolean;
  readonly isBoolean?: (leaf: Leaf) => boolean;
};

const MAX_ATOMS = 6;
const MAX_LEAVES = 12;
const FAILING_OPERATORS = new Set<string | undefined>(['/', '%', '**', '<<', '>>', '>>>']);
const ARITHMETIC_ATOM = /[/%]|\*\*|<<|>>/u;

function keysIn(root: Term): Set<string> {
  return foldTerm<Set<string>>(
    root,
    (node, children) => new Set([key(node), ...children.flatMap((set) => [...set])]),
  );
}

function isStaticCall(call: Term): boolean {
  const callee = call.children[0];
  return callee?.kind === 'member' && pureCallKind(callee) === 'static';
}

function isConstant(node: Term): boolean {
  return node.kind === 'literal' || node.kind === 'this';
}

function callBases(call: Term): Term[] {
  const [callee, ...args] = call.children;
  if (isStaticCall(call)) {
    return [];
  }
  return callee === undefined ? args : [...callee.children.slice(0, 1), ...args];
}

function basesOf(root: Term): Term[] {
  return foldTerm<Term[]>(root, (node, children) => {
    const below = children.flat();
    if (node.kind === 'member') {
      return [...below, ...node.children.slice(0, 1)];
    }
    if (node.kind === 'index') {
      return [...below, ...node.children];
    }
    return node.kind === 'call' ? [...below, ...callBases(node)] : below;
  }).filter((base) => !isConstant(base));
}

function mayFail(root: Term): boolean {
  return foldTerm<boolean>(root, (node, children) => {
    const own =
      (node.kind === 'binary' && FAILING_OPERATORS.has(node.value)) ||
      (node.kind === 'name' &&
        node.value?.startsWith('#value ') === true &&
        ARITHMETIC_ATOM.test(node.value));
    return own || children.some(Boolean);
  });
}

function earliestMention(facts: readonly Fact[], index: number, base: Term): number {
  const wanted = key(base);
  return facts.slice(0, index).findIndex((fact) => fact.keys.has(wanted));
}

function pinOf(facts: readonly Fact[], index: number, base: Term): number | undefined {
  const earlier = earliestMention(facts, index, base);
  if (earlier < 0 && index > 0) {
    return undefined;
  }
  return earlier < 0 ? index : earlier;
}

function pinsFor(facts: readonly Fact[]): Set<number> | undefined {
  const pins = facts.flatMap((fact, index) =>
    [...fact.bases].map((base) => pinOf(facts, index, base)),
  );
  const found = pins.filter((pin): pin is number => pin !== undefined);
  return found.length < pins.length ? undefined : new Set(found);
}

export function guardedLeaves(
  skeleton: Skeleton,
  { booleanContext, isPinned = () => false, isBoolean: isBooleanLeaf = () => false }: GuardOptions,
): Guard | undefined {
  const leaves = leavesOf(skeleton);
  const atoms = new Set(leaves.map(({ term }) => key(term)));
  const isSafe = leaves.every(
    ({ term }) => term.kind !== 'literal' && isSideEffectFree(term) && !mayFail(term),
  );
  const isValueSafe =
    booleanContext || leaves.every((leaf) => isBooleanValued(leaf.term) || isBooleanLeaf(leaf));
  if (!isSafe || !isValueSafe || atoms.size > MAX_ATOMS || leaves.length > MAX_LEAVES) {
    return undefined;
  }
  const facts = leaves.map(({ term }) => ({ keys: keysIn(term), bases: basesOf(term) }));
  const pinned = pinsFor(facts);
  if (pinned === undefined) {
    return undefined;
  }
  const kept = new Set(leaves.filter((leaf, index) => pinned.has(index) || isPinned(leaf, leaves)));
  return {
    leaves,
    pinned: kept,
    throwers: new Set(leaves.filter((_leaf, index) => (facts[index]?.bases.length ?? 0) > 0)),
  };
}

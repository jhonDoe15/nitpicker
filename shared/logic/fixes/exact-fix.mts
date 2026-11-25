import { depthFirst } from '../../traversal.mts';
import { printWith } from '../print.mts';
import { isSideEffectFree } from '../purity.mts';
import { isStatement, key, rangeKey } from '../terms.mts';
import { required } from '../typed/term-parts.mts';
import type { Range, Term } from '../typed/term-types.mts';

const ELIDED_KINDS = new Set(['if', 'block']);

function nodesOf(root: Term): Term[] {
  return [...depthFirst(root, (node: Term) => node.children)];
}

function inside(node: Term, range: Range): boolean {
  return node.range !== undefined && node.range[0] >= range[0] && node.range[1] <= range[1];
}

function identity(node: Term): string {
  return `${rangeKey(required(node.range, 'range'))} ${key(node)}`;
}

function isAtom(node: Term): boolean {
  return (
    (!isStatement(node) || node.children.length === 0) &&
    !isSideEffectFree(node) &&
    node.children.every((child) => isSideEffectFree(child))
  );
}

function resolver(originalNodes: readonly Term[]): (node: Term) => Term | undefined {
  const byIdentity = new Map(originalNodes.map((node) => [identity(node), node]));
  return (node) => {
    const exact = node.range === undefined ? undefined : byIdentity.get(identity(node));
    if (exact !== undefined) {
      return exact;
    }
    const same = originalNodes.filter((original) => key(original) === key(node));
    return same.length === 1 ? same[0] : undefined;
  };
}

function sameAtoms(
  formNodes: readonly Term[],
  originalNodes: readonly Term[],
  resolve: (node: Term) => Term | undefined,
): boolean {
  const atoms = originalNodes.filter(isAtom);
  const wanted = new Set<Term | undefined>(atoms);
  const kept = formNodes.map(resolve).filter((node) => wanted.has(node));
  return kept.length === atoms.length && kept.every((node, index) => node === atoms[index]);
}

export function exactFixText({
  root,
  form,
  source,
}: {
  readonly root: Term;
  readonly form: Term;
  readonly source: string;
}): string | undefined {
  const formNodes = nodesOf(form);
  const formRange = required(form.range, 'range');
  const originalNodes = nodesOf(root).filter((node) => inside(node, formRange));
  const resolve = resolver(originalNodes);
  const leaves = formNodes.filter(({ children }) => children.length === 0);
  const sources = new Map(leaves.map((leaf) => [leaf, resolve(leaf)]));
  if (
    formNodes.some(({ kind }) => ELIDED_KINDS.has(kind)) ||
    [...sources.values()].some((original) => original?.children.length !== 0) ||
    !sameAtoms(formNodes, originalNodes, resolve)
  ) {
    return undefined;
  }
  return printWith(form, (node) => {
    const range = sources.get(node)?.range;
    return range === undefined ? undefined : source.slice(range[0], range[1]);
  });
}

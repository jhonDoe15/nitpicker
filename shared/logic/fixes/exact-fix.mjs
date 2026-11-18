import { depthFirst } from '../../traversal.mjs';
import { printWith } from '../print.mjs';
import { isSideEffectFree } from '../purity.mjs';
import { isStatement, key, rangeKey } from '../terms.mjs';

const ELIDED_KINDS = new Set(['if', 'block']);

function nodesOf(root) {
  return [...depthFirst(root, (node) => node.children)];
}

function inside(node, range) {
  return node.range !== undefined && node.range[0] >= range[0] && node.range[1] <= range[1];
}

function identity(node) {
  return `${rangeKey(node.range)} ${key(node)}`;
}

function isAtom(node) {
  return (
    (!isStatement(node) || node.children.length === 0) &&
    !isSideEffectFree(node) &&
    node.children.every((child) => isSideEffectFree(child))
  );
}

function resolver(originalNodes) {
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

function sameAtoms(formNodes, originalNodes, resolve) {
  const atoms = originalNodes.filter(isAtom);
  const wanted = new Set(atoms);
  const kept = formNodes.map(resolve).filter((node) => wanted.has(node));
  return kept.length === atoms.length && kept.every((node, index) => node === atoms[index]);
}

/**
 * The source text that replaces `form.range` of `root` with `form`, its leaves written as their
 * source text, or undefined when the form elides statements, brings a leaf the original lacks,
 * or drops, repeats or reorders a part that may have effects.
 */
export function exactFixText({ root, form, source }) {
  const formNodes = nodesOf(form);
  const originalNodes = nodesOf(root).filter((node) => inside(node, form.range));
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

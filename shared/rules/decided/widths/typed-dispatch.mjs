import { rebuild } from '../../../near-duplicates/tree/nodes.mjs';

/**
 * `tree` rebuilt bottom-up with `typed[kind](node)` applied to each node whose kind has a typing
 * function, so a typed tree of a language states only what it knows per node kind.
 */
export function typedByKind(tree, typed) {
  return rebuild(tree, (node, children) => {
    const next = { ...node, children };
    return typed[node.kind]?.(next) ?? next;
  });
}

/** The `{ bits, signed }` type of a typed node, or undefined when it has none. */
export function tagOf(node) {
  return node.bits === undefined ? undefined : { bits: node.bits, signed: node.signed };
}

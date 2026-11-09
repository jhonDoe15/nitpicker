import { depthFirst } from '../../traversal.mjs';
import { accessesOf } from '../canonical/effects.mjs';
import { isBound, isLoop } from '../tree/nodes.mjs';

const DECLARING = new Set(['declare', 'foreach', 'parameter']);

function isTarget(node, index, child) {
  const target =
    (DECLARING.has(node.kind) && index === 1) ||
    (node.kind === 'assign' && node.value === '=' && index === 0);
  return target && isBound(child);
}

function readChildren(run) {
  return ({ node, late }) =>
    run.has(node)
      ? []
      : node.children
          .filter((child, index) => !isTarget(node, index, child))
          .map((child) => ({ node: child, late: late || node.kind === 'lambda' }));
}

function repeatedChildren({ node, repeated }) {
  return node.children.map((child) => ({
    node: child,
    repeated: repeated || isLoop(node) || node.kind === 'lambda',
  }));
}

function readsAround(tree, run) {
  const reads = { before: new Set(), after: new Set() };
  let seen = false;
  for (const { node, late } of depthFirst({ node: tree, late: false }, readChildren(run))) {
    seen ||= run.has(node);
    if (isBound(node)) {
      (seen || late ? reads.after : reads.before).add(node.value);
    }
  }
  return reads;
}

function repeats(tree, block) {
  const found = [...depthFirst({ node: tree, repeated: false }, repeatedChildren)].find(
    (entry) => entry.node === block,
  );
  return found?.repeated === true;
}

export function valuesUsedAfter(tree, block, statements) {
  const defined = new Set(statements.flatMap((statement) => [...accessesOf(statement).writes]));
  const reads = readsAround(tree, new Set(statements));
  const loop = repeats(tree, block);
  return [...defined].filter((name) => reads.after.has(name) || (loop && reads.before.has(name)))
    .length;
}

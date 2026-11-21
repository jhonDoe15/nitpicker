import { depthFirst } from '../../traversal.mts';
import { accessesOf } from '../canonical/effects.mts';
import { isBound, isLoop } from '../tree/nodes.mts';
import type { TreeNode } from '../tree/tree-types.mts';

const DECLARING = new Set(['declare', 'foreach', 'parameter']);

type ReadItem = { readonly node: TreeNode; readonly late: boolean };
type RepeatItem = { readonly node: TreeNode; readonly repeated: boolean };

function isTarget(node: TreeNode, index: number, child: TreeNode): boolean {
  const target =
    (DECLARING.has(node.kind) && index === 1) ||
    (node.kind === 'assign' && node.value === '=' && index === 0);
  return target && isBound(child);
}

function readChildren(run: ReadonlySet<TreeNode>): (item: ReadItem) => ReadItem[] {
  return ({ node, late }) =>
    run.has(node)
      ? []
      : node.children
          .filter((child, index) => !isTarget(node, index, child))
          .map((child) => ({ node: child, late: late || node.kind === 'lambda' }));
}

function repeatedChildren({ node, repeated }: RepeatItem): RepeatItem[] {
  return node.children.map((child) => ({
    node: child,
    repeated: repeated || isLoop(node) || node.kind === 'lambda',
  }));
}

function readsAround(
  tree: TreeNode,
  run: ReadonlySet<TreeNode>,
): { before: Set<string>; after: Set<string> } {
  const reads = { before: new Set<string>(), after: new Set<string>() };
  let seen = false;
  for (const { node, late } of depthFirst({ node: tree, late: false }, readChildren(run))) {
    seen ||= run.has(node);
    if (isBound(node)) {
      (seen || late ? reads.after : reads.before).add(node.value);
    }
  }
  return reads;
}

function repeats(tree: TreeNode, block: TreeNode): boolean {
  const found = [...depthFirst({ node: tree, repeated: false }, repeatedChildren)].find(
    (entry) => entry.node === block,
  );
  return found?.repeated === true;
}

function readBeforeWritten(
  accesses: readonly {
    readonly reads: ReadonlySet<string>;
    readonly writes: ReadonlySet<string>;
  }[],
): Set<string> {
  return new Set(
    accesses.flatMap(({ reads }, index) =>
      [...reads].filter((name) => !accesses.slice(0, index).some(({ writes }) => writes.has(name))),
    ),
  );
}

export function valuesUsedAfter(
  tree: TreeNode,
  block: TreeNode,
  statements: readonly TreeNode[],
): number {
  const accesses = statements.map((statement) => accessesOf(statement));
  const defined = new Set(accesses.flatMap(({ writes }) => [...writes]));
  const reads = readsAround(tree, new Set(statements));
  const carried = repeats(tree, block)
    ? new Set([...reads.before, ...readBeforeWritten(accesses)])
    : new Set();
  return [...defined].filter((name) => reads.after.has(name) || carried.has(name)).length;
}

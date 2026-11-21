import { appendAll, present } from './nodes.mts';
import type { TreeFields, TreeNode } from './tree-types.mts';

const ARITY: Readonly<Record<string, number>> = {
  function: 3,
  parameter: 2,
  if: 3,
  return: 1,
  throw: 1,
  break: 0,
  continue: 0,
  evaluate: 1,
  declare: 3,
  for: 4,
  while: 2,
  do: 2,
  foreach: 4,
  name: 0,
  literal: 0,
  this: 0,
  binary: 2,
  unary: 1,
  update: 1,
  assign: 2,
  conditional: 3,
  member: 1,
  index: 2,
  lambda: 2,
  type: 0,
  none: 0,
};

const BLOCK_SLOTS: Readonly<Record<string, readonly number[]>> = {
  if: [1],
  for: [0, 2, 3],
  while: [1],
  do: [0],
  foreach: [3],
  function: [2],
};

const BINDINGS = new Set(['bound', 'free']);

type RawNode = TreeFields & {
  readonly kind?: string | undefined;
  readonly children?: readonly (RawNode | undefined)[] | undefined;
};
type CheckedNode = RawNode & { readonly kind: string };
type Entry = { readonly node: CheckedNode; children: Entry[]; built?: TreeNode };

function checked(node: RawNode | undefined): CheckedNode {
  if (typeof node?.kind !== 'string') {
    throw new Error('near-duplicate tree: every node needs a kind');
  }
  return { ...node, kind: node.kind };
}

function checkShape(node: CheckedNode, children: readonly TreeNode[]): void {
  const arity = ARITY[node.kind];
  if (arity !== undefined && children.length !== arity) {
    throw new Error(
      `near-duplicate tree: ${node.kind} needs ${String(arity)} children, got ${String(children.length)}`,
    );
  }
  const misplaced = (BLOCK_SLOTS[node.kind] ?? []).find(
    (slot) => present(children[slot]).kind !== 'block',
  );
  if (misplaced !== undefined) {
    throw new Error(
      `near-duplicate tree: child ${String(misplaced)} of ${node.kind} must be a block`,
    );
  }
  if (node.kind === 'name' && !BINDINGS.has(node.binding ?? '')) {
    throw new Error('near-duplicate tree: a name needs binding bound or free');
  }
}

function copyOf(node: CheckedNode, children: readonly TreeNode[]): TreeNode {
  checkShape(node, children);
  return {
    kind: node.kind,
    children,
    ...(node.value === undefined ? {} : { value: node.value }),
    ...(node.text === undefined ? {} : { text: node.text }),
    ...(node.binding === undefined ? {} : { binding: node.binding }),
    ...(node.literal === undefined ? {} : { literal: node.literal }),
    ...(node.commutes === undefined ? {} : { commutes: node.commutes }),
    ...(node.start === undefined ? {} : { start: node.start }),
    ...(node.end === undefined ? {} : { end: node.end }),
  };
}

export function normalizeTree(root: RawNode): TreeNode {
  const top: Entry = { node: checked(root), children: [] };
  const order = [top];
  for (const entry of order) {
    entry.children = (entry.node.children ?? []).map((node) => ({
      node: checked(node),
      children: [],
    }));
    appendAll(order, entry.children);
  }
  for (const entry of order.toReversed()) {
    entry.built = copyOf(
      entry.node,
      entry.children.map((child) => present(child.built)),
    );
  }
  return present(top.built);
}

import { preOrder } from '../../traversal.mts';
import { appendAll } from '../../lists/lists.mts';
import type { BoundName, TreeFields, TreeNode } from './tree-types.mts';

const STATEMENTS = new Set([
  'block',
  'if',
  'return',
  'throw',
  'break',
  'continue',
  'evaluate',
  'declare',
  'for',
  'while',
  'do',
  'foreach',
  'statement',
]);

const EXPRESSIONS = new Set([
  'name',
  'literal',
  'this',
  'binary',
  'unary',
  'update',
  'assign',
  'conditional',
  'call',
  'new',
  'member',
  'index',
  'lambda',
  'expression',
]);

const JUMP_KINDS = new Set(['return', 'throw', 'break', 'continue']);

const LOOP_KINDS = new Set(['for', 'while', 'do', 'foreach']);

export { appendAll };

const COMPARED = ['kind', 'value', 'binding', 'literal', 'commutes'] as const;

const TYPE_SLOTS: Readonly<Record<string, number>> = {
  function: 0,
  parameter: 0,
  declare: 0,
  foreach: 0,
};

export const NONE: TreeNode = Object.freeze({ kind: 'none', children: Object.freeze([]) });

type Branch<Node> = { readonly children: readonly Node[] };

export function pairOf(node: TreeNode): readonly [TreeNode, TreeNode] {
  return [present(node.children[0]), present(node.children[1])];
}

export function tripleOf(node: TreeNode): readonly [TreeNode, TreeNode, TreeNode] {
  return [present(node.children[0]), present(node.children[1]), present(node.children[2])];
}

export function quadOf(node: TreeNode): readonly [TreeNode, TreeNode, TreeNode, TreeNode] {
  return [
    present(node.children[0]),
    present(node.children[1]),
    present(node.children[2]),
    present(node.children[3]),
  ];
}

export function isOneOf(set: ReadonlySet<string>, value: string | undefined): boolean {
  return value !== undefined && set.has(value);
}

export function present<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new TypeError('near-duplicate tree: a node the tree shape guarantees is missing');
  }
  return value;
}

export function categoryOf(node: TreeNode): string {
  if (STATEMENTS.has(node.kind)) {
    return 'statement';
  }
  if (EXPRESSIONS.has(node.kind)) {
    return 'expression';
  }
  return node.kind === 'type' ? 'type' : 'structure';
}

export function isJump(node: TreeNode | undefined): boolean {
  return node !== undefined && JUMP_KINDS.has(node.kind);
}

export function isLoop(node: TreeNode): boolean {
  return LOOP_KINDS.has(node.kind);
}

export function isBound<Node extends TreeNode>(node: Node | undefined): node is Node & BoundName {
  return node?.kind === 'name' && node.binding === 'bound';
}

export function isTypeSlot(node: TreeNode, index: number): boolean {
  return TYPE_SLOTS[node.kind] === index;
}

export function isSwitch(node: TreeNode): boolean {
  return node.kind === 'statement' && node.value === 'switch';
}

export function make(
  kind: string,
  children: readonly TreeNode[] = [],
  fields: TreeFields = {},
): TreeNode {
  return { ...fields, kind, children };
}

export function placed(start: number | undefined, end: number | undefined): TreeFields {
  return {
    ...(start === undefined ? {} : { start }),
    ...(end === undefined ? {} : { end }),
  };
}

export function placedLike(
  node: TreeNode,
  children: readonly TreeNode[],
  site: TreeNode,
): TreeNode {
  const copy: { -readonly [Key in keyof TreeNode]: TreeNode[Key] } = { ...node, children };
  delete copy.start;
  delete copy.end;
  return { ...copy, ...placed(site.start, site.end) };
}

export function withChildren<Node extends TreeNode>(node: Node, children: readonly Node[]): Node {
  return { ...node, children };
}

function childrenOf<Node extends Branch<Node>>(node: Node): readonly Node[] {
  return node.children;
}

export function nodesOf<Node extends Branch<Node>>(root: Node): Node[] {
  return preOrder(root, childrenOf);
}

function levelOrder<Node extends Branch<Node>>(root: Node): Node[] {
  const order = [root];
  for (const node of order) {
    appendAll(order, node.children);
  }
  return order;
}

export function rebuild<Node extends Branch<Node>, Built>(
  root: Node,
  build: (node: Node, children: Built[]) => Built,
): Built {
  const built = new Map<Node, { readonly result: Built }>();
  for (const node of levelOrder(root).toReversed()) {
    const children = node.children.map((child) => present(built.get(child)).result);
    built.set(node, { result: build(node, children) });
  }
  return present(built.get(root)).result;
}

export function contains<Node extends Branch<Node>>(
  root: Node,
  predicate: (node: Node) => boolean,
  skip: (node: Node) => boolean = () => false,
): boolean {
  const pending = [root];
  for (const node of pending) {
    if (predicate(node)) {
      return true;
    }
    if (!skip(node)) {
      appendAll(pending, node.children);
    }
  }
  return false;
}

export function sameTree(left: TreeNode, right: TreeNode): boolean {
  const pending: [TreeNode, TreeNode][] = [[left, right]];
  for (const [one, other] of pending) {
    const differs =
      COMPARED.some((field) => one[field] !== other[field]) ||
      one.children.length !== other.children.length;
    if (differs) {
      return false;
    }
    appendAll(
      pending,
      one.children.map((child, index): [TreeNode, TreeNode] => [
        child,
        present(other.children[index]),
      ]),
    );
  }
  return true;
}

export function sizeOf(root: TreeNode): number {
  return levelOrder(root).filter((node) => node.kind !== 'none').length;
}

export function blocksOf(root: TreeNode): TreeNode[] {
  return nodesOf(root).filter((node) => node.kind === 'block');
}

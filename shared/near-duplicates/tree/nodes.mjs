import { depthFirst } from '../../traversal.mjs';

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

const COMPARED = ['kind', 'value', 'binding', 'literal', 'commutes'];

const TYPE_SLOTS = { function: 0, parameter: 0, declare: 0, foreach: 0 };

export const NONE = Object.freeze({ kind: 'none', children: Object.freeze([]) });

export function categoryOf(node) {
  if (STATEMENTS.has(node.kind)) {
    return 'statement';
  }
  if (EXPRESSIONS.has(node.kind)) {
    return 'expression';
  }
  return node.kind === 'type' ? 'type' : 'structure';
}

export function isJump(node) {
  return JUMP_KINDS.has(node?.kind);
}

export function isLoop(node) {
  return LOOP_KINDS.has(node.kind);
}

export function isBound(node) {
  return node?.kind === 'name' && node.binding === 'bound';
}

export function isTypeSlot(node, index) {
  return TYPE_SLOTS[node.kind] === index;
}

export function isSwitch(node) {
  return node.kind === 'statement' && node.value === 'switch';
}

export function make(kind, children = [], fields = {}) {
  return { ...fields, kind, children };
}

export function withChildren(node, children) {
  return { ...node, children };
}

function childrenOf(node) {
  return node.children;
}

export function nodesOf(root) {
  return [...depthFirst(root, childrenOf)];
}

function levelOrder(root) {
  const order = [root];
  for (const node of order) {
    order.push(...node.children);
  }
  return order;
}

export function rebuild(root, build) {
  const built = new Map();
  for (const node of levelOrder(root).toReversed()) {
    built.set(
      node,
      build(
        node,
        node.children.map((child) => built.get(child)),
      ),
    );
  }
  return built.get(root);
}

export function contains(root, predicate, skip = () => false) {
  const pending = [root];
  for (const node of pending) {
    if (predicate(node)) {
      return true;
    }
    if (!skip(node)) {
      pending.push(...node.children);
    }
  }
  return false;
}

export function sameTree(left, right) {
  const pending = [[left, right]];
  for (const [one, other] of pending) {
    const differs =
      COMPARED.some((field) => one[field] !== other[field]) ||
      one.children.length !== other.children.length;
    if (differs) {
      return false;
    }
    pending.push(...one.children.map((child, index) => [child, other.children[index]]));
  }
  return true;
}

export function sizeOf(root) {
  return levelOrder(root).filter((node) => node.kind !== 'none').length;
}

export function blocksOf(root) {
  return nodesOf(root).filter((node) => node.kind === 'block');
}

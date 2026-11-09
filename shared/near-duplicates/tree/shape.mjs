const ARITY = {
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

const BLOCK_SLOTS = {
  if: [1],
  for: [0, 2, 3],
  while: [1],
  do: [0],
  foreach: [3],
  function: [2],
};

const FIELDS = ['value', 'text', 'binding', 'literal', 'commutes', 'start', 'end'];

const BINDINGS = new Set(['bound', 'free']);

function checkShape(node, children) {
  const arity = ARITY[node.kind];
  if (arity !== undefined && children.length !== arity) {
    throw new Error(
      `near-duplicate tree: ${node.kind} needs ${arity} children, got ${children.length}`,
    );
  }
  const misplaced = (BLOCK_SLOTS[node.kind] ?? []).find((slot) => children[slot].kind !== 'block');
  if (misplaced !== undefined) {
    throw new Error(`near-duplicate tree: child ${misplaced} of ${node.kind} must be a block`);
  }
  if (node.kind === 'name' && !BINDINGS.has(node.binding)) {
    throw new Error('near-duplicate tree: a name needs binding bound or free');
  }
}

function copyOf(node, children) {
  checkShape(node, children);
  const copy = { kind: node.kind, children };
  for (const field of FIELDS.filter((name) => node[name] !== undefined)) {
    copy[field] = node[field];
  }
  return copy;
}

export function normalizeTree(root) {
  const top = { node: root, children: [] };
  const order = [top];
  for (const entry of order) {
    entry.children = (entry.node.children ?? []).map((node) => ({ node, children: [] }));
    order.push(...entry.children);
  }
  for (const entry of order.toReversed()) {
    entry.built = copyOf(
      entry.node,
      entry.children.map((child) => child.built),
    );
  }
  return top.built;
}

import { pureCallKind } from '../../logic/purity.mjs';
import { appendAll, contains, isBound, isJump, isLoop, isSwitch, nodesOf } from '../tree/nodes.mjs';

const PURE_BINARY = new Set([
  '+',
  '-',
  '*',
  '<',
  '<=',
  '>',
  '>=',
  '==',
  '!=',
  '===',
  '!==',
  '&&',
  '||',
  '??',
  '&',
  '|',
  '^',
  '<<',
  '>>',
  '>>>',
]);

const PURE_UNARY = new Set(['!', '-', '+', '~', 'typeof']);

const LEAVES = new Set(['name', 'literal', 'this', 'conditional']);

const DECLARING = new Set(['declare', 'foreach', 'parameter']);

function locallyPure(node) {
  if (node.kind === 'binary') {
    return PURE_BINARY.has(node.value);
  }
  if (node.kind === 'unary') {
    return PURE_UNARY.has(node.value);
  }
  return LEAVES.has(node.kind);
}

function pureParts(node) {
  if (node.kind === 'call') {
    const [callee, ...rest] = node.children;
    return pureCallKind(callee) === 'static' ? rest : undefined;
  }
  return locallyPure(node) ? node.children : undefined;
}

function everyPart(root, accepts) {
  const pending = [root];
  for (const node of pending) {
    const parts = pureParts(node);
    if (parts === undefined || !accepts(node)) {
      return false;
    }
    appendAll(pending, parts);
  }
  return true;
}

export function isPure(node) {
  return everyPart(node, () => true);
}

function stableName(escaping) {
  return (node) =>
    node.kind !== 'this' && (node.kind !== 'name' || (isBound(node) && !escaping.has(node.value)));
}

export function isStable(node, escaping) {
  return node.kind === 'none' || everyPart(node, stableName(escaping));
}

export function escapingNames(tree) {
  const lambdas = nodesOf(tree).filter((node) => node.kind === 'lambda');
  return new Set(
    lambdas.flatMap((lambda) =>
      nodesOf(lambda)
        .filter(isBound)
        .map((name) => name.value),
    ),
  );
}

function targetRole(node, index, role) {
  if (node.kind === 'expression' && role !== 'read') {
    return role;
  }
  if (DECLARING.has(node.kind) && index === 1) {
    return 'write';
  }
  if (node.kind === 'assign' && index === 0) {
    return node.value === '=' ? 'write' : 'update';
  }
  return node.kind === 'update' ? 'update' : 'read';
}

function record(access, { node, role }) {
  if (role !== 'write') {
    access.reads.add(node.value);
  }
  if (role !== 'read') {
    access.writes.add(node.value);
  }
}

export function accessesOf(root) {
  const access = { reads: new Set(), writes: new Set() };
  const pending = [{ node: root, role: 'read' }];
  for (const entry of pending) {
    if (isBound(entry.node)) {
      record(access, entry);
    }
    appendAll(
      pending,
      entry.node.children.map((child, index) => ({
        node: child,
        role: targetRole(entry.node, index, entry.role),
      })),
    );
  }
  return access;
}

function exits({ node, loops, switches }) {
  if (node.kind === 'return') {
    return true;
  }
  if (node.kind === 'break') {
    return node.value !== undefined || loops + switches === 0;
  }
  return node.kind === 'continue' && (node.value !== undefined || loops === 0);
}

function innerEntries({ node, loops, switches }) {
  if (node.kind === 'lambda') {
    return [];
  }
  const inner = {
    loops: loops + (isLoop(node) ? 1 : 0),
    switches: switches + (isSwitch(node) ? 1 : 0),
  };
  return node.children.map((child) => ({ node: child, ...inner }));
}

function leaves(entries, exitsHere) {
  const pending = [...entries];
  for (const entry of pending) {
    if (exitsHere(entry)) {
      return true;
    }
    appendAll(pending, innerEntries(entry));
  }
  return false;
}

export function leavesRun(statements) {
  return leaves(
    statements.map((node) => ({ node, loops: 0, switches: 0 })),
    exits,
  );
}

export function continuesLoop(body) {
  return leaves(
    [{ node: body, loops: 0, switches: 0 }],
    ({ node, loops }) => node.kind === 'continue' && (node.value !== undefined || loops === 0),
  );
}

export function holdsJump(node) {
  return contains(node, isJump, (current) => current.kind === 'lambda');
}

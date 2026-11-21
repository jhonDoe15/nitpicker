import { pureCallKind } from '../../logic/purity.mts';
import { calleeTerm } from '../tree/callee-term.mts';
import { appendAll, contains, isBound, isJump, isLoop, isSwitch, nodesOf } from '../tree/nodes.mts';
import type { BoundName, TreeNode } from '../tree/tree-types.mts';

type Role = 'read' | 'write' | 'update';
type Access = { readonly reads: Set<string>; readonly writes: Set<string> };
type Flow = { readonly node: TreeNode; readonly loops: number; readonly switches: number };

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

const WRITE = 'write';

const DECLARING = new Set(['declare', 'foreach', 'parameter']);

function locallyPure(node: TreeNode): boolean {
  if (node.kind === 'binary') {
    return node.value !== undefined && PURE_BINARY.has(node.value);
  }
  if (node.kind === 'unary') {
    return node.value !== undefined && PURE_UNARY.has(node.value);
  }
  return LEAVES.has(node.kind);
}

function pureParts(node: TreeNode): readonly TreeNode[] | undefined {
  if (node.kind === 'call') {
    const [callee, ...rest] = node.children;
    return callee !== undefined && pureCallKind(calleeTerm(callee)) === 'static' ? rest : undefined;
  }
  return locallyPure(node) ? node.children : undefined;
}

function everyPart(root: TreeNode, accepts: (node: TreeNode) => boolean): boolean {
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

export function isPure(node: TreeNode): boolean {
  return everyPart(node, () => true);
}

function stableName(escaping: ReadonlySet<string>): (node: TreeNode) => boolean {
  return (node) =>
    node.kind !== 'this' && (node.kind !== 'name' || (isBound(node) && !escaping.has(node.value)));
}

export function isStable(node: TreeNode, escaping: ReadonlySet<string>): boolean {
  return node.kind === 'none' || everyPart(node, stableName(escaping));
}

export function escapingNames(tree: TreeNode): Set<string> {
  const lambdas = nodesOf(tree).filter((node) => node.kind === 'lambda');
  const captured = lambdas.flatMap((lambda) =>
    nodesOf(lambda).flatMap((node) => (isBound(node) ? [node.value] : [])),
  );
  const addressed = nodesOf(tree).flatMap((node) =>
    isBound(node) && node.addressTaken === true ? [node.value] : [],
  );
  return new Set([...captured, ...addressed]);
}

function targetRole(node: TreeNode, index: number, role: Role): Role {
  if (node.kind === 'expression' && role !== 'read') {
    return role;
  }
  if (DECLARING.has(node.kind) && index === 1) {
    return WRITE;
  }
  if (node.kind === 'assign' && index === 0) {
    return node.value === '=' ? WRITE : 'update';
  }
  return node.kind === 'update' ? 'update' : 'read';
}

function record(access: Access, { node, role }: { node: BoundName; role: Role }): void {
  if (role !== WRITE) {
    access.reads.add(node.value);
  }
  if (role !== 'read') {
    access.writes.add(node.value);
  }
}

export function accessesOf(root: TreeNode): Access {
  const access: Access = { reads: new Set(), writes: new Set() };
  const pending: { node: TreeNode; role: Role }[] = [{ node: root, role: 'read' }];
  for (const entry of pending) {
    if (isBound(entry.node)) {
      record(access, { node: entry.node, role: entry.role });
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

function exits({ node, loops, switches }: Flow): boolean {
  if (node.kind === 'return') {
    return true;
  }
  if (node.kind === 'break') {
    return node.value !== undefined || loops + switches === 0;
  }
  return node.kind === 'continue' && (node.value !== undefined || loops === 0);
}

function innerEntries({ node, loops, switches }: Flow): Flow[] {
  if (node.kind === 'lambda') {
    return [];
  }
  const inner = {
    loops: loops + (isLoop(node) ? 1 : 0),
    switches: switches + (isSwitch(node) ? 1 : 0),
  };
  return node.children.map((child) => ({ node: child, ...inner }));
}

function leaves(entries: readonly Flow[], exitsHere: (entry: Flow) => boolean): boolean {
  const pending = [...entries];
  for (const entry of pending) {
    if (exitsHere(entry)) {
      return true;
    }
    appendAll(pending, innerEntries(entry));
  }
  return false;
}

export function leavesRun(statements: readonly TreeNode[]): boolean {
  return leaves(
    statements.map((node) => ({ node, loops: 0, switches: 0 })),
    exits,
  );
}

export function continuesLoop(body: TreeNode): boolean {
  return leaves(
    [{ node: body, loops: 0, switches: 0 }],
    ({ node, loops }) => node.kind === 'continue' && (node.value !== undefined || loops === 0),
  );
}

export function holdsJump(node: TreeNode): boolean {
  return contains(node, isJump, (current) => current.kind === 'lambda');
}

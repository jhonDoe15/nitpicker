import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { bodyNodesOf, memberKeyName, type Entry, type EntryKind } from './call-graph.mts';

export type GuardMap = ReadonlyMap<string, ReadonlyMap<string, number>>;

type GuardCollector = {
  readonly setReads: Map<string, number>;
  readonly setWrites: Set<string>;
  readonly mapReads: Map<string, number>;
  readonly mapWrites: Set<string>;
  readonly counterReads: Map<string, number>;
  readonly counterWrites: Set<string>;
};

const RELATIONAL_OPERATORS = new Set<string>(['>', '>=', '<', '<=']);
const STEP_OPERATORS = new Set<string>(['+', '-']);
const ASSIGN_OPERATORS = new Set<string>(['=', '+=', '-=']);
const COUNTER_NAME =
  /depth|turn|level|nesting|recursion|remaining|budget|ttl|hop|round|step|retr(?:y|ies)|attempt/iu;

function recordEarliest(map: Map<string, number>, key: string, pos: number): void {
  const existing = map.get(key);
  if (existing === undefined || pos < existing) {
    map.set(key, pos);
  }
}

function localNamesOf(nodes: readonly TSESTree.Node[]): Set<string> {
  const locals = new Set<string>();
  for (const node of nodes) {
    if (
      node.type === AST_NODE_TYPES.VariableDeclarator &&
      node.id.type === AST_NODE_TYPES.Identifier
    ) {
      locals.add(node.id.name);
    }
  }
  return locals;
}

function targetNameOf(node: TSESTree.Node, locals: ReadonlySet<string>): string | undefined {
  const inner = unwrapped(node);
  if (inner.type === AST_NODE_TYPES.Identifier) {
    return locals.has(inner.name) ? undefined : inner.name;
  }
  if (inner.type !== AST_NODE_TYPES.MemberExpression || inner.computed) {
    return undefined;
  }
  const prop = memberKeyName(inner.property);
  if (prop === undefined) {
    return undefined;
  }
  const obj = unwrapped(inner.object);
  if (obj.type === AST_NODE_TYPES.ThisExpression) {
    return `this.${prop}`;
  }
  return obj.type === AST_NODE_TYPES.Identifier && !locals.has(obj.name)
    ? `${obj.name}.${prop}`
    : undefined;
}

function isCounterTarget(target: string): boolean {
  const dot = target.lastIndexOf('.');
  const leaf = dot === -1 ? target : target.slice(dot + 1);
  return COUNTER_NAME.test(leaf);
}

function counterTargetOf(node: TSESTree.Node, locals: ReadonlySet<string>): string | undefined {
  const target = targetNameOf(node, locals);
  return target !== undefined && isCounterTarget(target) ? target : undefined;
}

function recordCollectionGuard(
  collector: GuardCollector,
  method: string,
  entry: Readonly<{ target: string; pos: number }>,
): void {
  if (method === 'has') {
    recordEarliest(collector.setReads, entry.target, entry.pos);
    recordEarliest(collector.mapReads, entry.target, entry.pos);
    return;
  }
  if (method === 'add') {
    collector.setWrites.add(entry.target);
    return;
  }
  if (method === 'get') {
    recordEarliest(collector.mapReads, entry.target, entry.pos);
    return;
  }
  if (method === 'set') {
    collector.mapWrites.add(entry.target);
  }
}

function collectCallGuard(
  node: TSESTree.CallExpression,
  locals: ReadonlySet<string>,
  collector: GuardCollector,
): void {
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return;
  }
  const method = nameOf(callee.property);
  const target = targetNameOf(callee.object, locals);
  if (method !== undefined && target !== undefined) {
    recordCollectionGuard(collector, method, { target, pos: node.range[0] });
  }
}

function collectBinaryGuard(
  node: TSESTree.BinaryExpression,
  locals: ReadonlySet<string>,
  collector: GuardCollector,
): void {
  const left = counterTargetOf(node.left, locals);
  const right = counterTargetOf(node.right, locals);
  if (RELATIONAL_OPERATORS.has(node.operator)) {
    if (left !== undefined) {
      recordEarliest(collector.counterReads, left, node.range[0]);
    }
    if (right !== undefined) {
      recordEarliest(collector.counterReads, right, node.range[0]);
    }
    return;
  }
  if (STEP_OPERATORS.has(node.operator)) {
    if (left !== undefined) {
      collector.counterWrites.add(left);
    }
    if (right !== undefined) {
      collector.counterWrites.add(right);
    }
  }
}

function collectNodeGuard(
  node: TSESTree.Node,
  locals: ReadonlySet<string>,
  collector: GuardCollector,
): void {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    collectCallGuard(node, locals, collector);
    return;
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression) {
    collectBinaryGuard(node, locals, collector);
    return;
  }
  if (node.type === AST_NODE_TYPES.UpdateExpression) {
    const target = counterTargetOf(node.argument, locals);
    if (target !== undefined) {
      collector.counterWrites.add(target);
    }
    return;
  }
  if (node.type === AST_NODE_TYPES.AssignmentExpression && ASSIGN_OPERATORS.has(node.operator)) {
    const target = counterTargetOf(node.left, locals);
    if (target !== undefined) {
      collector.counterWrites.add(target);
    }
  }
}

function mergeMatched(
  result: Map<string, number>,
  reads: ReadonlyMap<string, number>,
  writes: ReadonlySet<string>,
): void {
  for (const [name, pos] of reads) {
    if (writes.has(name)) {
      recordEarliest(result, name, pos);
    }
  }
}

function entryGuardsOf(entry: Entry, kind: EntryKind): Map<string, number> {
  const nodes = bodyNodesOf(entry.fn.body, kind);
  const locals = localNamesOf(nodes);
  const collector: GuardCollector = {
    setReads: new Map(),
    setWrites: new Set(),
    mapReads: new Map(),
    mapWrites: new Set(),
    counterReads: new Map(),
    counterWrites: new Set(),
  };
  for (const node of nodes) {
    collectNodeGuard(node, locals, collector);
  }
  const guards = new Map<string, number>();
  mergeMatched(guards, collector.setReads, collector.setWrites);
  mergeMatched(guards, collector.mapReads, collector.mapWrites);
  mergeMatched(guards, collector.counterReads, collector.counterWrites);
  return guards;
}

export function guardsOf(entries: readonly Entry[], kind: EntryKind): GuardMap {
  const map = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    map.set(entry.name, entryGuardsOf(entry, kind));
  }
  return map;
}

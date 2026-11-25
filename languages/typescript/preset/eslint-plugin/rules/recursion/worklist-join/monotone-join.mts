import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../../typed/node-views.mts';
import { calleeNameOf, isNamedMember, unwrapped } from '../../typed/syntax-views.mts';
import type { WorklistInfo } from './worklist-loop.mts';
import { containerGetOf, stripFallback, targetNameOf } from './worklist-nodes.mts';

export type MonotoneJoinMatch = {
  readonly state: string;
  readonly nextAliases: ReadonlyMap<string, string>;
};

type JoinLookup = {
  readonly containers: ReadonlySet<string>;
  readonly successorVars: ReadonlySet<string>;
  readonly aliases: ReadonlyMap<string, string>;
  readonly cleared: ReadonlySet<string>;
  readonly written: ReadonlySet<string>;
};

const JOIN_NAME =
  /^(?:join|merge|union|combine|accumulate|lub|widen|addAll)|(?:Join|Merge|Union)$/u;
const MUTATING_JOIN_METHODS = new Set(['add', 'set']);

function nextAccessContainer(
  node: TSESTree.Node,
  containers: ReadonlySet<string>,
  successorVars: ReadonlySet<string>,
): string | undefined {
  const access = containerGetOf(node);
  return access !== undefined && containers.has(access.container) && successorVars.has(access.key)
    ? access.container
    : undefined;
}

function nextAliasesOf(
  nodes: readonly TSESTree.Node[],
  containers: ReadonlySet<string>,
  successorVars: ReadonlySet<string>,
): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const node of nodes) {
    if (
      node.type !== AST_NODE_TYPES.VariableDeclarator ||
      node.id.type !== AST_NODE_TYPES.Identifier ||
      node.init === null
    ) {
      continue;
    }
    const container = nextAccessContainer(node.init, containers, successorVars);
    if (container !== undefined) {
      aliases.set(node.id.name, container);
    }
  }
  return aliases;
}

function nextStateTargetOf(node: TSESTree.Node, lookup: JoinLookup): string | undefined {
  const inner = stripFallback(node);
  if (inner.type === AST_NODE_TYPES.Identifier && lookup.aliases.has(inner.name)) {
    return lookup.aliases.get(inner.name);
  }
  return nextAccessContainer(inner, lookup.containers, lookup.successorVars);
}

function writtenNextContainersOf(
  nodes: readonly TSESTree.Node[],
  containers: ReadonlySet<string>,
  successorVars: ReadonlySet<string>,
): Set<string> {
  const written = new Set<string>();
  for (const node of nodes) {
    const found = writtenNextOfNode(node, containers, successorVars);
    if (found !== undefined) {
      written.add(found);
    }
  }
  return written;
}

function writtenNextOfNode(
  node: TSESTree.Node,
  containers: ReadonlySet<string>,
  successorVars: ReadonlySet<string>,
): string | undefined {
  if (node.type === AST_NODE_TYPES.AssignmentExpression && node.operator === '=') {
    return nextAccessContainer(node.left, containers, successorVars);
  }
  if (node.type !== AST_NODE_TYPES.CallExpression || node.arguments.length < 2) {
    return undefined;
  }
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  const [first] = node.arguments;
  const container = nameOf(callee.property) === 'set' ? targetNameOf(callee.object) : undefined;
  const key = first === undefined ? undefined : nameOf(unwrapped(first));
  return container !== undefined &&
    key !== undefined &&
    containers.has(container) &&
    successorVars.has(key)
    ? container
    : undefined;
}

function clearedNextContainersOf(nodes: readonly TSESTree.Node[], lookup: JoinLookup): Set<string> {
  const cleared = new Set<string>();
  for (const node of nodes) {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      continue;
    }
    const callee = unwrapped(node.callee);
    if (
      callee.type !== AST_NODE_TYPES.MemberExpression ||
      callee.computed ||
      nameOf(callee.property) !== 'clear'
    ) {
      continue;
    }
    const target = nextStateTargetOf(callee.object, lookup);
    if (target !== undefined) {
      cleared.add(target);
    }
  }
  return cleared;
}

function isJoinCallee(callee: TSESTree.Node): boolean {
  if (
    isNamedMember(callee, 'Math', 'max') ||
    isNamedMember(callee, 'Math', 'min') ||
    isNamedMember(callee, 'Object', 'assign')
  ) {
    return true;
  }
  const name = calleeNameOf(callee);
  return name !== undefined && JOIN_NAME.test(name);
}

function joinFromCallArgs(node: TSESTree.CallExpression, lookup: JoinLookup): string | undefined {
  for (const arg of node.arguments) {
    const target = nextStateTargetOf(arg, lookup);
    if (target !== undefined) {
      return target;
    }
  }
  return undefined;
}

function joinFromCall(node: TSESTree.CallExpression, lookup: JoinLookup): string | undefined {
  const callee = unwrapped(node.callee);
  if (isJoinCallee(callee)) {
    const fromArg = joinFromCallArgs(node, lookup);
    if (fromArg !== undefined) {
      return fromArg;
    }
    return callee.type === AST_NODE_TYPES.MemberExpression
      ? nextStateTargetOf(callee.object, lookup)
      : undefined;
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  const method = nameOf(callee.property);
  if (method === undefined || !MUTATING_JOIN_METHODS.has(method)) {
    return undefined;
  }
  const target = nextStateTargetOf(callee.object, lookup);
  return target !== undefined && !lookup.cleared.has(target) ? target : undefined;
}

function joinFromAssignment(
  node: TSESTree.AssignmentExpression,
  lookup: JoinLookup,
): string | undefined {
  if (node.operator === '|=' || node.operator === '||=') {
    return nextAccessContainer(node.left, lookup.containers, lookup.successorVars);
  }
  if (
    node.operator === '=' &&
    node.left.type === AST_NODE_TYPES.MemberExpression &&
    node.left.computed
  ) {
    const target = nextStateTargetOf(node.left.object, lookup);
    return target !== undefined && !lookup.cleared.has(target) ? target : undefined;
  }
  return undefined;
}

function joinFromPureExpr(node: TSESTree.Node, lookup: JoinLookup): string | undefined {
  if (
    (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === '|') ||
    (node.type === AST_NODE_TYPES.LogicalExpression && node.operator === '||')
  ) {
    const target = nextStateTargetOf(node.left, lookup) ?? nextStateTargetOf(node.right, lookup);
    return target !== undefined && lookup.written.has(target) ? target : undefined;
  }
  if (node.type === AST_NODE_TYPES.SpreadElement) {
    const target = nextStateTargetOf(node.argument, lookup);
    return target !== undefined && lookup.written.has(target) ? target : undefined;
  }
  return undefined;
}

function joinTargetOfNode(node: TSESTree.Node, lookup: JoinLookup): string | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return joinFromCall(node, lookup);
  }
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return joinFromAssignment(node, lookup);
  }
  return joinFromPureExpr(node, lookup);
}

export function findMonotoneJoinedState(
  info: WorklistInfo,
  containers: ReadonlySet<string>,
): MonotoneJoinMatch | undefined {
  if (containers.size === 0) {
    return undefined;
  }
  const aliases = nextAliasesOf(info.nodes, containers, info.successorVars);
  const written = writtenNextContainersOf(info.nodes, containers, info.successorVars);
  const baseLookup: JoinLookup = {
    containers,
    successorVars: info.successorVars,
    aliases,
    cleared: new Set(),
    written,
  };
  const lookup: JoinLookup = {
    ...baseLookup,
    cleared: clearedNextContainersOf(info.nodes, baseLookup),
  };
  for (const node of info.nodes) {
    const matched = joinTargetOfNode(node, lookup);
    if (matched !== undefined) {
      return { state: matched, nextAliases: aliases };
    }
  }
  return undefined;
}

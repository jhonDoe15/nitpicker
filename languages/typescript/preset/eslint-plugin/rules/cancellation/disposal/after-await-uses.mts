import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { syntaxChildren } from '../../decided/syntax.mts';
import { contains, nameOf, nodesWithoutNested } from '../../typed/node-views.mts';
import { GUARD_NAME } from './disposal-flags.mts';

const FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);
const EVENT_METHODS = new Set<string>(['fire', 'emit']);
const RESOURCE_CALLS = new Set<string>([
  'setTimeout',
  'setInterval',
  'spawn',
  'fork',
  'createModel',
  'createTerminal',
]);

export type Use = { readonly node: TSESTree.Node; readonly kind: string };

export function nodesOf(root: TSESTree.Node): readonly TSESTree.Node[] {
  return nodesWithoutNested(root, FUNCTIONS, syntaxChildren);
}

function rootsAtThis(node: TSESTree.Node): boolean {
  let current = node;
  while (current.type === AST_NODE_TYPES.MemberExpression) {
    current = current.object;
  }
  return current.type === AST_NODE_TYPES.ThisExpression;
}

function calleeName(call: TSESTree.CallExpression): string | undefined {
  const callee = call.callee;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
    ? callee.property.name
    : undefined;
}

const ANY_RECEIVER = new Set<string>(['createModel', 'createTerminal']);
const PROCESS_RECEIVERS = new Set<string>(['cp', 'child_process', 'childProcess']);
const GLOBAL_RECEIVERS = new Set<string>(['window', 'globalThis', 'self', 'global']);
const TIMERS = new Set<string>(['setTimeout', 'setInterval']);

function memberResource(name: string, receiver: TSESTree.Expression): boolean {
  const owner = nameOf(receiver) ?? '';
  return (
    ANY_RECEIVER.has(name) ||
    (TIMERS.has(name) && GLOBAL_RECEIVERS.has(owner)) ||
    (PROCESS_RECEIVERS.has(owner) && RESOURCE_CALLS.has(name))
  );
}

export function useOf(node: TSESTree.Node): Use | undefined {
  const name = node.type === AST_NODE_TYPES.CallExpression ? calleeName(node) : undefined;
  if (node.type !== AST_NODE_TYPES.CallExpression || name === undefined) {
    return undefined;
  }
  const member = node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee : undefined;
  if (member !== undefined && EVENT_METHODS.has(name) && rootsAtThis(member.object)) {
    return { node, kind: 'event' };
  }
  const started =
    member === undefined ? RESOURCE_CALLS.has(name) : memberResource(name, member.object);
  const awaited = TIMERS.has(name) && node.parent.type === AST_NODE_TYPES.AwaitExpression;
  return started && !awaited ? { node, kind: 'resource' } : undefined;
}

function isGuard(node: TSESTree.Node, flags: ReadonlySet<string>): boolean {
  if (node.type === AST_NODE_TYPES.MemberExpression && !node.computed) {
    const property = node.property;
    return (
      property.type === AST_NODE_TYPES.Identifier &&
      (flags.has(property.name) || GUARD_NAME.test(property.name))
    );
  }
  return node.type === AST_NODE_TYPES.Identifier && GUARD_NAME.test(node.name);
}

function blockOf(node: TSESTree.Node): TSESTree.Node | undefined {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type !== AST_NODE_TYPES.BlockStatement) {
      continue;
    }
    const owner = current.parent;
    return owner.type === AST_NODE_TYPES.TryStatement || owner.type === AST_NODE_TYPES.CatchClause
      ? blockOf(owner)
      : current;
  }
  return undefined;
}

export function unguardedUses(method: TSESTree.Node, flags: ReadonlySet<string>): readonly Use[] {
  const nodes = nodesOf(method);
  const awaits = nodes.filter((node) => node.type === AST_NODE_TYPES.AwaitExpression);
  return nodes
    .map(useOf)
    .filter((use): use is Use => use !== undefined)
    .filter((use) => {
      const last = awaits
        .filter((awaited) => awaited.range[1] <= use.node.range[0])
        .filter((awaited) => {
          const block = blockOf(awaited);
          return block !== undefined && contains(block, use.node);
        })
        .at(-1);
      if (last === undefined) {
        return false;
      }
      const between = nodes.filter(
        (node) => node.range[0] >= last.range[1] && node.range[1] <= use.node.range[1],
      );
      return !between.some((node) => isGuard(node, flags));
    });
}

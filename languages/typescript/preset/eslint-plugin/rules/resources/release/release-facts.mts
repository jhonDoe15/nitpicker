import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { depthFirst, nameOf, nodeChildren, nodesWithoutNested } from '../../typed/node-views.mts';

const ACQUIRES = new Set<string>([
  'createQueryRunner',
  'getConnection',
  'connect',
  'acquire',
  'checkout',
  'lock',
  'getReader',
  'startSession',
  'rollup',
  'rolldown',
]);
const RELEASES = new Set<string>([
  'release',
  'releaseLock',
  'unlock',
  'close',
  'end',
  'destroy',
  'dispose',
  'endSession',
  'disconnect',
]);
const ESCAPING_METHODS = new Set<string>(['push', 'set', 'add', 'register', 'track', 'unshift']);
const SCOPES = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.ClassDeclaration,
  AST_NODE_TYPES.ClassExpression,
]);

function unwrapped(node: TSESTree.Node): { node: TSESTree.Node; awaited: boolean } {
  const chain = [node];
  let awaited = false;
  for (const current of chain) {
    if (current.type === AST_NODE_TYPES.AwaitExpression) {
      awaited = true;
      chain.push(current.argument);
    } else if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.ChainExpression ||
      current.type === AST_NODE_TYPES.TSNonNullExpression
    ) {
      chain.push(current.expression);
    }
  }
  return { node: chain.at(-1) ?? node, awaited };
}

export function ownNodes(root: TSESTree.Node): TSESTree.Node[] {
  return nodesWithoutNested(root, SCOPES, nodeChildren);
}

export function acquiredName(statement: TSESTree.Node): string | undefined {
  if (
    statement.type !== AST_NODE_TYPES.VariableDeclaration ||
    statement.kind === 'using' ||
    statement.kind === 'await using' ||
    statement.declarations.length !== 1
  ) {
    return undefined;
  }
  const [declarator] = statement.declarations;
  if (declarator.id.type !== AST_NODE_TYPES.Identifier || declarator.init === null) {
    return undefined;
  }
  const { node, awaited } = unwrapped(declarator.init);
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const { callee } = node;
  const method = nameOf(callee.type === AST_NODE_TYPES.MemberExpression ? callee.property : callee);
  const needsAwait = method === 'connect' || method === 'acquire' || method === 'lock';
  return method !== undefined && ACQUIRES.has(method) && (awaited || !needsAwait)
    ? declarator.id.name
    : undefined;
}

export function releaseOf(
  node: TSESTree.Node,
  name: string,
): { call: TSESTree.CallExpression; method: string } | undefined {
  const call = unwrapped(node).node;
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression ||
    call.callee.computed ||
    nameOf(call.callee.object) !== name
  ) {
    return undefined;
  }
  const method = nameOf(call.callee.property);
  return method !== undefined && RELEASES.has(method) ? { call, method } : undefined;
}

export function releasesInRecovery(nodes: readonly TSESTree.Node[], name: string): boolean {
  return nodes.some(
    (node) =>
      node.type === AST_NODE_TYPES.TryStatement &&
      [node.finalizer, node.handler?.body].some(
        (part) =>
          part !== null &&
          part !== undefined &&
          ownNodes(part).some((inner) => releaseOf(inner, name) !== undefined),
      ),
  );
}

function usedBy(node: TSESTree.Node, name: string): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(node.callee.object) === name
  );
}

function handlesItself(node: TSESTree.TryStatement): boolean {
  return (
    node.handler !== null &&
    !ownNodes(node.handler).some(
      (inner) =>
        inner.type === AST_NODE_TYPES.ThrowStatement ||
        inner.type === AST_NODE_TYPES.ReturnStatement,
    )
  );
}

function exits(node: TSESTree.Node, name: string): boolean {
  return (
    node.type === AST_NODE_TYPES.AwaitExpression ||
    node.type === AST_NODE_TYPES.YieldExpression ||
    node.type === AST_NODE_TYPES.ReturnStatement ||
    node.type === AST_NODE_TYPES.ThrowStatement ||
    usedBy(node, name)
  );
}

function swallowsFailure(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.AwaitExpression) {
    return false;
  }
  const call = node.argument;
  const [handler] = call.type === AST_NODE_TYPES.CallExpression ? call.arguments : [];
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(call.callee.property) === 'catch' &&
    (handler?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      handler?.type === AST_NODE_TYPES.FunctionExpression) &&
    !ownNodes(handler).some((inner) => inner.type === AST_NODE_TYPES.ThrowStatement)
  );
}

function opaque(root: TSESTree.Node, node: TSESTree.Node): boolean {
  return (
    (node !== root && SCOPES.has(node.type)) ||
    (node.type === AST_NODE_TYPES.TryStatement && handlesItself(node)) ||
    swallowsFailure(node)
  );
}

export function canFailBefore(statements: readonly TSESTree.Statement[], name: string): boolean {
  return statements.some((statement) =>
    [
      ...depthFirst<TSESTree.Node>(statement, (node) =>
        opaque(statement, node) ? [] : nodeChildren(node),
      ),
    ].some((node) => !swallowsFailure(node) && exits(node, name)),
  );
}

function escapesVia(identifier: TSESTree.Node): boolean {
  const parent = identifier.parent;
  if (parent === undefined) {
    return false;
  }
  if (
    parent.type === AST_NODE_TYPES.ReturnStatement ||
    parent.type === AST_NODE_TYPES.YieldExpression ||
    parent.type === AST_NODE_TYPES.ArrayExpression ||
    parent.type === AST_NODE_TYPES.VariableDeclarator ||
    parent.type === AST_NODE_TYPES.Property ||
    parent.type === AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    return parent.right === identifier;
  }
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.callee.type === AST_NODE_TYPES.MemberExpression &&
    ESCAPING_METHODS.has(nameOf(parent.callee.property) ?? '') &&
    parent.arguments.some((argument) => argument === identifier)
  );
}

export function escapes(nodes: readonly TSESTree.Node[], name: string): boolean {
  return nodes.some(
    (node) => node.type === AST_NODE_TYPES.Identifier && node.name === name && escapesVia(node),
  );
}

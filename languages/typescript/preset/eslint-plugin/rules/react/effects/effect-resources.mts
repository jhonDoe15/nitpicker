import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  chainOf,
  nodeChildren,
  nodesWithoutNested,
  plainText,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { TYPE_WRAPPERS, unwrapOf } from '../../typed/syntax-views.mts';

export type Leak = {
  readonly node: TSESTree.Node;
  readonly resource: string;
  readonly close: string;
};

const functionTypes = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);
const CLOSE = 'close';
const DISCONNECT = 'disconnect';
const closersByResource: Readonly<Record<string, string>> = {
  WebSocket: CLOSE,
  EventSource: CLOSE,
  BroadcastChannel: CLOSE,
  Worker: 'terminate',
  SharedWorker: 'port.close',
  MutationObserver: DISCONNECT,
  PerformanceObserver: DISCONNECT,
  ReportingObserver: DISCONNECT,
};
const closingMethods = new Set([CLOSE, 'terminate', DISCONNECT]);
const globalObjects = new Set(['window', 'globalThis', 'self']);
const WATCH_POSITION = /^(?:(?:window|globalThis|self)\.)?navigator\.geolocation\.watchPosition$/u;

export function ownNodes(body: TSESTree.Node): TSESTree.Node[] {
  return nodesWithoutNested(body, functionTypes, nodeChildren);
}

function isUnbound(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  return (variableNamed(sourceCode, identifier)?.defs.length ?? 0) === 0;
}

export function globalName(sourceCode: SourceCode, node: TSESTree.Node): string | undefined {
  const plain = unwrapOf(node, TYPE_WRAPPERS);
  if (plain.type === AST_NODE_TYPES.Identifier) {
    return isUnbound(sourceCode, plain) ? plain.name : undefined;
  }
  const isGlobalMember =
    plain.type === AST_NODE_TYPES.MemberExpression &&
    !plain.computed &&
    plain.object.type === AST_NODE_TYPES.Identifier &&
    globalObjects.has(plain.object.name) &&
    isUnbound(sourceCode, plain.object) &&
    plain.property.type === AST_NODE_TYPES.Identifier;
  return isGlobalMember ? plain.property.name : undefined;
}

function memberNamesAbove(reference: TSESTree.Node): string[] | undefined {
  const members = chainOf(reference, (current) =>
    current.parent?.type === AST_NODE_TYPES.MemberExpression && current.parent.object === current
      ? current.parent
      : undefined,
  ).slice(1);
  const names = members.map((member) =>
    member.type === AST_NODE_TYPES.MemberExpression &&
    !member.computed &&
    member.property.type === AST_NODE_TYPES.Identifier
      ? member.property.name
      : '',
  );
  return names.length === 0 ? undefined : names;
}

function staysOpen(variable: TSESLint.Scope.Variable): boolean {
  return variable.references
    .filter((reference) => !reference.init)
    .every((reference) => {
      const names = memberNamesAbove(reference.identifier);
      return names !== undefined && !names.some((name) => name === '' || closingMethods.has(name));
    });
}

export function declaredHandle(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): TSESLint.Scope.Variable | undefined {
  const declarator = node.parent;
  return declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.init === node &&
    declarator.id.type === AST_NODE_TYPES.Identifier
    ? sourceCode.getDeclaredVariables(declarator).at(0)
    : undefined;
}

function isDroppedChain(node: TSESTree.Node): boolean {
  if (node.parent?.type === AST_NODE_TYPES.ExpressionStatement) {
    return true;
  }
  const names = memberNamesAbove(node);
  if (names === undefined || names.some((name) => closingMethods.has(name))) {
    return false;
  }
  const member = names.reduce<TSESTree.Node | undefined>((current) => current?.parent, node);
  const call = member?.parent;
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.callee === member &&
    call.parent.type === AST_NODE_TYPES.ExpressionStatement
  );
}

function neverClosed(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const handle = declaredHandle(sourceCode, node);
  return handle === undefined ? isDroppedChain(node) : staysOpen(handle);
}

function openedResource(sourceCode: SourceCode, node: TSESTree.Node): Leak | undefined {
  if (node.type !== AST_NODE_TYPES.NewExpression) {
    return undefined;
  }
  const resource = globalName(sourceCode, node.callee);
  const closer = resource === undefined ? undefined : closersByResource[resource];
  return resource !== undefined && closer !== undefined && neverClosed(sourceCode, node)
    ? { node, resource: `new ${resource}(...)`, close: `handle.${closer}()` }
    : undefined;
}

function isShadowed(sourceCode: SourceCode, callee: TSESTree.Node): boolean {
  const root = chainOf(callee, (link) =>
    link.type === AST_NODE_TYPES.MemberExpression ? link.object : undefined,
  ).at(-1);
  return root?.type !== AST_NODE_TYPES.Identifier || !isUnbound(sourceCode, root);
}

function watchedPosition(sourceCode: SourceCode, node: TSESTree.Node): Leak | undefined {
  if (
    node.type !== AST_NODE_TYPES.CallExpression ||
    !WATCH_POSITION.test(plainText(node.callee, sourceCode)) ||
    isShadowed(sourceCode, node.callee)
  ) {
    return undefined;
  }
  const outer = node.parent.type === AST_NODE_TYPES.ChainExpression ? node.parent : node;
  const handle = declaredHandle(sourceCode, outer);
  const isDropped =
    handle === undefined
      ? outer.parent.type === AST_NODE_TYPES.ExpressionStatement
      : handle.references.every((reference) => reference.init);
  return isDropped
    ? {
        node,
        resource: 'navigator.geolocation.watchPosition(...)',
        close: 'navigator.geolocation.clearWatch(id)',
      }
    : undefined;
}

export function leakedResources(sourceCode: SourceCode, body: TSESTree.Node): Leak[] {
  return ownNodes(body).flatMap(
    (node) => openedResource(sourceCode, node) ?? watchedPosition(sourceCode, node) ?? [],
  );
}

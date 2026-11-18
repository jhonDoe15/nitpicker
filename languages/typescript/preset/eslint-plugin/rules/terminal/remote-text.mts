import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, stringValue } from '../analysis/constant-resolution.mts';
import { plainName } from '../encoding/plain-names.mts';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';

export type Taint = 'response' | 'body' | 'text';

const CLIENTS = new Set(['axios', 'got', 'ky', 'needle', 'superagent']);
const BODY_PROPERTIES = new Set(['data', 'body']);
const READERS = new Set(['json', 'text']);
const SOCKET_NAME =
  /^(?:ws|wss|socket|websocket|webSocket|hot|channel|ipc|connection|conn)$|Socket$/u;
const LIFECYCLE_EVENTS = new Set([
  'open',
  'close',
  'error',
  'connect',
  'connection',
  'disconnect',
  'listening',
]);
const MAX_DEPTH = 5;

function peel(node: TSESTree.Node): TSESTree.Node {
  const plain = unwrapped(node);
  return plain.type === AST_NODE_TYPES.AwaitExpression ? peel(plain.argument) : plain;
}

function isSocketCallback(fn: TSESTree.Node): boolean {
  const call = fn.parent;
  if (
    call?.type !== AST_NODE_TYPES.CallExpression ||
    call.arguments[1] !== fn ||
    LIFECYCLE_EVENTS.has(stringValue(call.arguments[0]) ?? '')
  ) {
    return false;
  }
  const callee = unwrapped(call.callee);
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    memberName(callee) === 'on' &&
    SOCKET_NAME.test(plainName(callee.object) ?? '')
  );
}

function callTaint(
  context: Context,
  call: TSESTree.CallExpression,
  depth: number,
): Taint | undefined {
  const callee = unwrapped(call.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'fetch' || CLIENTS.has(callee.name) ? 'response' : undefined;
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const owner = plainName(callee.object) ?? '';
  if (callee.object.type === AST_NODE_TYPES.Identifier && CLIENTS.has(owner)) {
    return 'response';
  }
  const reader = memberName(callee) ?? '';
  if (!READERS.has(reader) || taintOf(context, callee.object, depth + 1) !== 'response') {
    return undefined;
  }
  return reader === 'text' ? 'text' : 'body';
}

function declaredTaint(
  context: Context,
  definition: { readonly name: TSESTree.Node; readonly node: TSESTree.Node },
  depth: number,
): Taint | undefined {
  const { node, name } = definition;
  if (node.type === AST_NODE_TYPES.VariableDeclarator && node.init !== null) {
    const source = taintOf(context, node.init, depth + 1);
    if (node.id.type === AST_NODE_TYPES.Identifier) {
      return source;
    }
    const key =
      name.parent?.type === AST_NODE_TYPES.Property ? plainName(name.parent.key) : undefined;
    if (source === 'body') {
      return 'text';
    }
    return source === 'response' && BODY_PROPERTIES.has(key ?? '') ? 'body' : undefined;
  }
  const isParameter = [
    AST_NODE_TYPES.ArrowFunctionExpression,
    AST_NODE_TYPES.FunctionExpression,
  ].includes(node.type as never);
  const first = isParameter && 'params' in node ? node.params[0] : undefined;
  const inFirst =
    first !== undefined && name.range[0] >= first.range[0] && name.range[1] <= first.range[1];
  if (!inFirst || !isSocketCallback(node)) {
    return undefined;
  }
  return name.parent?.type === AST_NODE_TYPES.Property ? 'text' : 'body';
}

export function taintOf(context: Context, node: TSESTree.Node, depth = 0): Taint | undefined {
  const plain = peel(node);
  if (depth > MAX_DEPTH) {
    return undefined;
  }
  if (plain.type === AST_NODE_TYPES.CallExpression) {
    return callTaint(context, plain, depth);
  }
  if (plain.type === AST_NODE_TYPES.MemberExpression) {
    const owner = taintOf(context, plain.object, depth + 1);
    return owner === 'body' ||
      (owner === 'response' && BODY_PROPERTIES.has(memberName(plain) ?? ''))
      ? 'body'
      : undefined;
  }
  if (plain.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const variable = findVariable(context, plain, plain.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition === undefined ? undefined : declaredTaint(context, definition, depth);
}

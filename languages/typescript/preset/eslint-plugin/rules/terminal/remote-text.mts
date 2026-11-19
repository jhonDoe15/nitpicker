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
const RESPONSE = 'response';

type Step = (inner: Taint | undefined) => Taint | undefined;
type Link =
  { readonly result: Taint | undefined } | { readonly next: TSESTree.Node; readonly apply: Step };
type Definition = { readonly name: TSESTree.Node; readonly node: TSESTree.Node };

function peel(node: TSESTree.Node): TSESTree.Node {
  const pending: TSESTree.Node[] = [node];
  for (const current of pending) {
    const plain = unwrapped(current);
    if (plain.type !== AST_NODE_TYPES.AwaitExpression) {
      return plain;
    }
    pending.push(plain.argument);
  }
  return node;
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

function readerTaint(reader: string, inner: Taint | undefined): Taint | undefined {
  if (inner !== RESPONSE) {
    return undefined;
  }
  return reader === 'text' ? 'text' : 'body';
}

function callLink(call: TSESTree.CallExpression): Link {
  const callee = unwrapped(call.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return { result: callee.name === 'fetch' || CLIENTS.has(callee.name) ? RESPONSE : undefined };
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return { result: undefined };
  }
  const owner = plainName(callee.object) ?? '';
  if (callee.object.type === AST_NODE_TYPES.Identifier && CLIENTS.has(owner)) {
    return { result: RESPONSE };
  }
  const reader = memberName(callee) ?? '';
  return READERS.has(reader)
    ? { next: callee.object, apply: (inner) => readerTaint(reader, inner) }
    : { result: undefined };
}

function memberLink(member: TSESTree.MemberExpression): Link {
  return {
    next: member.object,
    apply: (owner) =>
      owner === 'body' || (owner === RESPONSE && BODY_PROPERTIES.has(memberName(member) ?? ''))
        ? 'body'
        : undefined,
  };
}

function destructuredTaint(
  source: Taint | undefined,
  declarator: TSESTree.VariableDeclarator,
  name: TSESTree.Node,
): Taint | undefined {
  if (declarator.id.type === AST_NODE_TYPES.Identifier) {
    return source;
  }
  const key =
    name.parent?.type === AST_NODE_TYPES.Property ? plainName(name.parent.key) : undefined;
  if (source === 'body') {
    return 'text';
  }
  return source === RESPONSE && BODY_PROPERTIES.has(key ?? '') ? 'body' : undefined;
}

function parameterTaint(node: TSESTree.Node, name: TSESTree.Node): Taint | undefined {
  const isFunction =
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression;
  const first = isFunction ? node.params.at(0) : undefined;
  const inFirst =
    first !== undefined && name.range[0] >= first.range[0] && name.range[1] <= first.range[1];
  if (!(inFirst && isSocketCallback(node))) {
    return undefined;
  }
  return name.parent?.type === AST_NODE_TYPES.Property ? 'text' : 'body';
}

function declaredLink({ name, node }: Definition): Link {
  if (node.type === AST_NODE_TYPES.VariableDeclarator && node.init !== null) {
    return { next: node.init, apply: (source) => destructuredTaint(source, node, name) };
  }
  return { result: parameterTaint(node, name) };
}

function linkOf(context: Context, node: TSESTree.Node): Link {
  const plain = peel(node);
  if (plain.type === AST_NODE_TYPES.CallExpression) {
    return callLink(plain);
  }
  if (plain.type === AST_NODE_TYPES.MemberExpression) {
    return memberLink(plain);
  }
  if (plain.type !== AST_NODE_TYPES.Identifier) {
    return { result: undefined };
  }
  const variable = findVariable(context, plain, plain.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition === undefined ? { result: undefined } : declaredLink(definition);
}

function applyAll(steps: readonly Step[], base: Taint | undefined): Taint | undefined {
  return steps.reduceRight((value, apply) => apply(value), base);
}

export function taintOf(context: Context, node: TSESTree.Node): Taint | undefined {
  const steps: Step[] = [];
  const pending: TSESTree.Node[] = [node];
  for (const [depth, current] of pending.entries()) {
    if (depth > MAX_DEPTH) {
      return applyAll(steps, undefined);
    }
    const link = linkOf(context, current);
    if ('result' in link) {
      return applyAll(steps, link.result);
    }
    steps.push(link.apply);
    pending.push(link.next);
  }
  return applyAll(steps, undefined);
}

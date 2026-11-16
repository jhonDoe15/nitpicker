import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../analysis/constant-resolution.mts';
import type { Context } from '../security/security-values.mts';
import {
  type Finding,
  type Origin,
  initOf,
  isCaseInsensitiveValue,
  requestLike,
  isStructuredValue,
  nameOf,
  originOf,
  unwrap,
} from './origins/http-origins.mts';

type MaybeNode = TSESTree.Node | undefined;
type HeaderOrigin = Origin & { readonly kind: 'header' };
type Method = { readonly name: string; readonly receiver: TSESTree.Node };
type Lookup = { readonly table: TSESTree.Node; readonly key: MaybeNode };

const EQUALITY = new Set(['===', '!==', '==', '!=']);
const PREFIX_METHODS = new Set(['startsWith', 'endsWith', 'includes', 'indexOf']);
const LOOKUP_METHODS = new Set(['has', 'get', 'includes', 'indexOf']);
const REGEX_USERS = new Set(['test', 'exec']);
const REGEX_ARGUMENT_USERS = new Set(['match', 'matchAll', 'search']);
const MIME_TABLE = /mime|content.?type/i;
const COOKIE_PREFIX = /^__(?:Host|Secure)-/;
const HAS_LETTER = /[a-z]/i;
const SEPARATORS = /^[\s,;]+$/;
const LOWERING = new Set(['toLowerCase', 'toUpperCase', 'toLocaleLowerCase', 'toLocaleUpperCase']);

function hasLetters(node: MaybeNode): boolean {
  return HAS_LETTER.test(stringValue(unwrap(node)) ?? '');
}

function regexOf(
  node: MaybeNode,
): { readonly pattern: string; readonly flags: string } | undefined {
  const target = unwrap(node);
  return target?.type === AST_NODE_TYPES.Literal && 'regex' in target ? target.regex : undefined;
}

function isRegex(node: MaybeNode): boolean {
  return regexOf(node) !== undefined;
}

function methodCall(call: TSESTree.CallExpression): Method | undefined {
  const callee = unwrap(call.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
    ? { name: nameOf(callee) ?? '', receiver: callee.object }
    : undefined;
}

function separatorsOnly(node: MaybeNode): boolean {
  const text = stringValue(unwrap(node));
  const regex = regexOf(node)?.pattern;
  return (
    (text !== undefined && text !== '' && SEPARATORS.test(text)) ||
    (regex !== undefined && /[,;]/.test(regex))
  );
}

function regexSplits(pattern: string): boolean {
  return /[,;]|q\s*=|charset|boundary/i.test(pattern);
}

function headerOf(context: Context, node: MaybeNode): HeaderOrigin | undefined {
  const origin = originOf(context, node);
  return origin?.kind === 'header' ? origin : undefined;
}

export function handSplit(context: Context, call: TSESTree.CallExpression): Finding | undefined {
  const method = methodCall(call);
  if (method === undefined) {
    return undefined;
  }
  const { name, receiver } = method;
  const [argument] = call.arguments;
  const regexReceiver = REGEX_USERS.has(name) && isRegex(receiver);
  const regexArgument = REGEX_ARGUMENT_USERS.has(name) && isRegex(argument);
  const splitting = name === 'split' && argument !== undefined && separatorsOnly(argument);
  const subject = regexReceiver ? argument : receiver;
  const pattern = regexOf(regexReceiver ? receiver : argument)?.pattern;
  const parsing = splitting || ((regexReceiver || regexArgument) && regexSplits(pattern ?? ''));
  const origin = parsing ? headerOf(context, subject) : undefined;
  return isStructuredValue(origin)
    ? { node: call, messageId: 'handSplit', data: { header: origin.header } }
    : undefined;
}

function valueUse(context: Context, call: TSESTree.CallExpression): MaybeNode {
  const method = methodCall(call);
  const [argument] = call.arguments;
  if (method === undefined) {
    return undefined;
  }
  if (PREFIX_METHODS.has(method.name) && hasLetters(argument)) {
    return method.receiver;
  }
  const receiverRegex = regexOf(method.receiver);
  if (REGEX_USERS.has(method.name) && receiverRegex && !receiverRegex.flags.includes('i')) {
    return HAS_LETTER.test(receiverRegex.pattern.replaceAll(/\\./g, '')) ? argument : undefined;
  }
  const argumentRegex = regexOf(argument);
  if (
    REGEX_ARGUMENT_USERS.has(method.name) &&
    argumentRegex !== undefined &&
    !argumentRegex.flags.includes('i')
  ) {
    return method.receiver;
  }
  return LOOKUP_METHODS.has(method.name) &&
    argument !== undefined &&
    headerOf(context, method.receiver) === undefined
    ? argument
    : undefined;
}

function reportValue(
  context: Context,
  node: TSESTree.Node,
  subject: MaybeNode,
): Finding | undefined {
  const origin = subject === undefined ? undefined : originOf(context, subject);
  return isCaseInsensitiveValue(origin)
    ? { node, messageId: 'valueCase', data: { header: origin.header } }
    : undefined;
}

export function valueComparison(context: Context, node: TSESTree.Node): Finding | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return reportValue(context, node, valueUse(context, node));
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression && EQUALITY.has(node.operator)) {
    const [subject, other] = hasLetters(node.right)
      ? [node.left, node.right]
      : [node.right, node.left];
    return hasLetters(other) ? reportValue(context, node, subject) : undefined;
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === 'in') {
    return reportValue(context, node, node.left);
  }
  if (node.type === AST_NODE_TYPES.MemberExpression && node.computed) {
    return reportValue(context, node, node.property);
  }
  if (node.type === AST_NODE_TYPES.SwitchStatement) {
    const literal = node.cases.some((each) => each.test !== null && hasLetters(each.test));
    return literal ? reportValue(context, node, node.discriminant) : undefined;
  }
  return undefined;
}

function incomingHeaders(context: Context, node: TSESTree.Node): boolean {
  const target = unwrap(node);
  const init = target.type === AST_NODE_TYPES.Identifier ? initOf(context, target) : target;
  return (
    init?.type === AST_NODE_TYPES.MemberExpression &&
    !init.computed &&
    nameOf(init) === 'headers' &&
    requestLike(context, init.object)
  );
}

function exactName(node: TSESTree.Node): {
  readonly owner: MaybeNode;
  readonly name: string | undefined;
} {
  if (node.type === AST_NODE_TYPES.MemberExpression && node.computed) {
    return { owner: node.object, name: stringValue(node.property) };
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === 'in') {
    return { owner: node.right, name: stringValue(node.left) };
  }
  return { owner: undefined, name: undefined };
}

export function nameLookup(context: Context, node: TSESTree.Node): Finding | undefined {
  const { owner, name } = exactName(node);
  if (
    name === undefined ||
    owner === undefined ||
    !/[A-Z]/.test(name) ||
    !incomingHeaders(context, owner)
  ) {
    return undefined;
  }
  return { node, messageId: 'nameCase', data: { name, lower: name.toLowerCase() } };
}

export function cookiePrefix(call: TSESTree.CallExpression): Finding | undefined {
  const method = methodCall(call);
  const [argument] = call.arguments;
  const text = stringValue(unwrap(argument));
  const receiver = method === undefined ? undefined : unwrap(method.receiver);
  const lowered =
    receiver?.type === AST_NODE_TYPES.CallExpression &&
    LOWERING.has(methodCall(receiver)?.name ?? '');
  const prefixed = method?.name === 'startsWith' && text !== undefined && COOKIE_PREFIX.test(text);
  const receiverRegex = method === undefined ? undefined : regexOf(method.receiver);
  const regex =
    method !== undefined &&
    REGEX_USERS.has(method.name) &&
    receiverRegex !== undefined &&
    !receiverRegex.flags.includes('i') &&
    /^\^__\(?(?:\?:)?(?:Host|Secure)/.test(receiverRegex.pattern);
  return (prefixed && !lowered) || regex ? { node: call, messageId: 'cookiePrefix' } : undefined;
}

function tableLookup(node: TSESTree.Node): Lookup | undefined {
  if (node.type === AST_NODE_TYPES.MemberExpression && node.computed) {
    return { table: node.object, key: node.property };
  }
  const method = node.type === AST_NODE_TYPES.CallExpression ? methodCall(node) : undefined;
  return node.type === AST_NODE_TYPES.CallExpression &&
    method !== undefined &&
    ['get', 'has'].includes(method.name)
    ? { table: method.receiver, key: node.arguments[0] }
    : undefined;
}

export function extensionLookup(context: Context, node: TSESTree.Node): Finding | undefined {
  const lookup = tableLookup(node);
  const isTable = lookup !== undefined && MIME_TABLE.test(nameOf(lookup.table) ?? '');
  return isTable && originOf(context, lookup.key)?.kind === 'extension'
    ? { node, messageId: 'extensionCase' }
    : undefined;
}

import { stringValue } from '../analysis/constant-resolution.mjs';
import {
  initOf,
  isCaseInsensitiveValue,
  requestLike,
  isStructuredValue,
  nameOf,
  originOf,
  unwrap,
} from './origins/http-origins.mjs';

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

function hasLetters(node) {
  return HAS_LETTER.test(stringValue(unwrap(node)) ?? '');
}

function isRegex(node) {
  return unwrap(node)?.type === 'Literal' && unwrap(node).regex !== undefined;
}

function methodCall(call) {
  const callee = unwrap(call.callee);
  return callee.type === 'MemberExpression' && !callee.computed
    ? { name: nameOf(callee), receiver: callee.object }
    : undefined;
}

function separatorsOnly(node) {
  const text = stringValue(unwrap(node));
  const regex = isRegex(node) ? unwrap(node).regex.pattern : undefined;
  return (
    (text !== undefined && text !== '' && SEPARATORS.test(text)) ||
    (regex !== undefined && /[,;]/.test(regex))
  );
}

function regexSplits(pattern) {
  return /[,;]|q\s*=|charset|boundary/i.test(pattern);
}

function headerOf(context, node) {
  const origin = originOf(context, node);
  return origin?.kind === 'header' ? origin : undefined;
}

export function handSplit(context, call) {
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
  const pattern = unwrap(regexReceiver ? receiver : argument);
  const parsing =
    splitting || ((regexReceiver || regexArgument) && regexSplits(pattern.regex.pattern));
  const origin = parsing ? headerOf(context, subject) : undefined;
  return isStructuredValue(origin)
    ? { node: call, messageId: 'handSplit', data: { header: origin.header } }
    : undefined;
}

function valueUse(context, call) {
  const method = methodCall(call);
  const [argument] = call.arguments;
  if (method === undefined) {
    return undefined;
  }
  if (PREFIX_METHODS.has(method.name) && hasLetters(argument)) {
    return method.receiver;
  }
  if (
    REGEX_USERS.has(method.name) &&
    isRegex(method.receiver) &&
    !unwrap(method.receiver).regex.flags.includes('i')
  ) {
    return HAS_LETTER.test(unwrap(method.receiver).regex.pattern.replaceAll(/\\./g, ''))
      ? argument
      : undefined;
  }
  if (
    REGEX_ARGUMENT_USERS.has(method.name) &&
    isRegex(argument) &&
    !unwrap(argument).regex.flags.includes('i')
  ) {
    return method.receiver;
  }
  return LOOKUP_METHODS.has(method.name) &&
    argument !== undefined &&
    headerOf(context, method.receiver) === undefined
    ? argument
    : undefined;
}

function reportValue(context, node, subject) {
  const origin = subject === undefined ? undefined : originOf(context, subject);
  return isCaseInsensitiveValue(origin)
    ? { node, messageId: 'valueCase', data: { header: origin.header } }
    : undefined;
}

export function valueComparison(context, node) {
  if (node.type === 'CallExpression') {
    return reportValue(context, node, valueUse(context, node));
  }
  if (node.type === 'BinaryExpression' && EQUALITY.has(node.operator)) {
    const [subject, other] = hasLetters(node.right)
      ? [node.left, node.right]
      : [node.right, node.left];
    return hasLetters(other) ? reportValue(context, node, subject) : undefined;
  }
  if (node.type === 'BinaryExpression' && node.operator === 'in') {
    return reportValue(context, node, node.left);
  }
  if (node.type === 'MemberExpression' && node.computed) {
    return reportValue(context, node, node.property);
  }
  if (node.type === 'SwitchStatement') {
    const literal = node.cases.some((each) => each.test !== null && hasLetters(each.test));
    return literal ? reportValue(context, node, node.discriminant) : undefined;
  }
  return undefined;
}

function incomingHeaders(context, node) {
  const target = unwrap(node) ?? node;
  const init = target.type === 'Identifier' ? initOf(context, target) : target;
  return (
    init?.type === 'MemberExpression' &&
    !init.computed &&
    nameOf(init) === 'headers' &&
    requestLike(context, init.object)
  );
}

function exactName(node) {
  if (node.type === 'MemberExpression' && node.computed) {
    return { owner: node.object, name: stringValue(node.property) };
  }
  if (node.type === 'BinaryExpression' && node.operator === 'in') {
    return { owner: node.right, name: stringValue(node.left) };
  }
  return { owner: undefined, name: undefined };
}

export function nameLookup(context, node) {
  const { owner, name } = exactName(node);
  if (name === undefined || !/[A-Z]/.test(name) || !incomingHeaders(context, owner)) {
    return undefined;
  }
  return { node, messageId: 'nameCase', data: { name, lower: name.toLowerCase() } };
}

export function cookiePrefix(call) {
  const method = methodCall(call);
  const [argument] = call.arguments;
  const text = stringValue(unwrap(argument));
  const receiver = method === undefined ? undefined : unwrap(method.receiver);
  const lowered =
    receiver?.type === 'CallExpression' && LOWERING.has(methodCall(receiver)?.name ?? '');
  const prefixed = method?.name === 'startsWith' && text !== undefined && COOKIE_PREFIX.test(text);
  const regex =
    method !== undefined &&
    REGEX_USERS.has(method.name) &&
    isRegex(method.receiver) &&
    !unwrap(method.receiver).regex.flags.includes('i') &&
    /^\^__\(?(?:\?:)?(?:Host|Secure)/.test(unwrap(method.receiver).regex.pattern);
  return (prefixed && !lowered) || regex ? { node: call, messageId: 'cookiePrefix' } : undefined;
}

function tableLookup(node) {
  if (node.type === 'MemberExpression' && node.computed) {
    return { table: node.object, key: node.property };
  }
  const method = node.type === 'CallExpression' ? methodCall(node) : undefined;
  return ['get', 'has'].includes(method?.name ?? '')
    ? { table: method.receiver, key: node.arguments[0] }
    : undefined;
}

export function extensionLookup(context, node) {
  const lookup = tableLookup(node);
  const isTable = lookup !== undefined && MIME_TABLE.test(nameOf(lookup.table) ?? '');
  return isTable && originOf(context, lookup.key)?.kind === 'extension'
    ? { node, messageId: 'extensionCase' }
    : undefined;
}

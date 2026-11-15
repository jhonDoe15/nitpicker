import { findVariable, stringValue } from '../../analysis/constant-resolution.mjs';
import { chainEnd } from '../../lifecycles/scope/close-scopes.mjs';
import { STRUCTURED_HEADERS, VALUE_HEADERS } from './header-tables.mjs';
import { isGetterOwner, isHeaderBag, isRequestLike } from './receivers.mjs';

const WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ChainExpression',
]);
const KEEPING_METHODS = new Set(['trim', 'trimStart', 'trimEnd', 'toString', 'valueOf']);
const EXTENSION_SPLIT = new Set(['pop', 'at']);
const MAX_DEPTH = 4;
const DOT_HEADERS = new Set([
  'accept',
  'authorization',
  'connection',
  'cookie',
  'expect',
  'forwarded',
  'host',
  'origin',
  'pragma',
  'te',
  'upgrade',
  'vary',
]);

export function unwrap(node) {
  return chainEnd(node, (current) =>
    WRAPPERS.has(current?.type) ? current.expression : undefined,
  );
}

export function nameOf(node) {
  const target = unwrap(node);
  if (target?.type === 'Identifier') {
    return target.name;
  }
  if (target?.type === 'MemberExpression' && !target.computed) {
    return target.property.type === 'Identifier' ? target.property.name : undefined;
  }
  return undefined;
}

function memberKey(member) {
  return member.computed ? stringValue(member.property) : nameOf(member);
}

function isBag(context, node) {
  const target = unwrap(node);
  if (target?.type === 'NewExpression') {
    return nameOf(target.callee) === 'Headers';
  }
  return isHeaderBag(context, target, nameOf(target));
}

export function requestLike(context, node) {
  return isRequestLike(context, node, nameOf(node));
}

function headerGetter(context, call) {
  const callee = unwrap(call.callee);
  if (callee.type !== 'MemberExpression' || callee.computed) {
    return undefined;
  }
  const method = nameOf(callee);
  const owner = unwrap(callee.object);
  const getsFromBag = method === 'get' && isBag(context, owner);
  const named = method === 'header' || method === 'getHeader';
  const getsFromRequest =
    (named && requestLike(context, owner)) ||
    (method === 'get' && isGetterOwner(context, owner, nameOf(owner)));
  return getsFromBag || getsFromRequest ? stringValue(call.arguments[0])?.toLowerCase() : undefined;
}

function headerMember(context, member) {
  const key = isBag(context, member.object) ? memberKey(member) : undefined;
  return key !== undefined && (member.computed || DOT_HEADERS.has(key))
    ? key.toLowerCase()
    : undefined;
}

function isSplitOnDot(node) {
  const call = unwrap(node);
  return (
    call?.type === 'CallExpression' &&
    nameOf(call.callee) === 'split' &&
    stringValue(call.arguments[0]) === '.'
  );
}

function usesLastDot(node) {
  const pending = [unwrap(node)];
  for (const target of pending) {
    if (target?.type === 'BinaryExpression') {
      pending.push(unwrap(target.left), unwrap(target.right));
    }
  }
  return pending.some(
    (target) => target?.type === 'CallExpression' && nameOf(target.callee) === 'lastIndexOf',
  );
}

function extensionOf(node) {
  const call = unwrap(node);
  if (call?.type !== 'CallExpression') {
    return false;
  }
  const method = nameOf(call.callee);
  if (method === 'extname') {
    return true;
  }
  const callee = unwrap(call.callee);
  const afterLastDot = ['slice', 'substring', 'substr'].includes(method ?? '');
  return (
    (EXTENSION_SPLIT.has(method) &&
      callee.type === 'MemberExpression' &&
      isSplitOnDot(callee.object)) ||
    (afterLastDot && usesLastDot(call.arguments[0]))
  );
}

function resolvedInit(context, identifier) {
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  const writes = variable?.references.filter((reference) => reference.isWrite()) ?? [];
  const sameFunction =
    variable !== undefined &&
    variable.scope.variableScope === context.sourceCode.getScope(identifier).variableScope;
  return definition?.type === 'Variable' &&
    definition.node.id.type === 'Identifier' &&
    writes.length === 1 &&
    sameFunction
    ? definition.node.init
    : undefined;
}

export function initOf(context, node) {
  const target = unwrap(node);
  return target?.type === 'Identifier' ? unwrap(resolvedInit(context, target)) : undefined;
}

function callStep(context, call) {
  const callee = unwrap(call.callee);
  if (callee.type === 'Identifier' && callee.name === 'String') {
    return { next: call.arguments[0] };
  }
  if (callee.type === 'MemberExpression' && KEEPING_METHODS.has(nameOf(callee) ?? '')) {
    return { next: callee.object };
  }
  if (extensionOf(call)) {
    return { found: { kind: 'extension' } };
  }
  const header = headerGetter(context, call);
  return header === undefined ? undefined : { found: { kind: 'header', header } };
}

function originStep(context, node) {
  const target = unwrap(node);
  if (target?.type === 'LogicalExpression') {
    return ['??', '||'].includes(target.operator) ? { next: target.left } : undefined;
  }
  if (target?.type === 'Identifier') {
    const init = resolvedInit(context, target);
    return init === undefined || init === null ? undefined : { next: init };
  }
  if (target?.type === 'MemberExpression') {
    const header = headerMember(context, target);
    return header === undefined ? undefined : { found: { kind: 'header', header } };
  }
  return target?.type === 'CallExpression' ? callStep(context, target) : undefined;
}

export function originOf(context, node) {
  const pending = [node];
  for (const current of pending) {
    const step = originStep(context, current);
    if (step === undefined || pending.length > MAX_DEPTH) {
      return undefined;
    }
    if (step.found !== undefined) {
      return step.found;
    }
    pending.push(step.next);
  }
  return undefined;
}

export function isCaseInsensitiveValue(origin) {
  return origin?.kind === 'header' && VALUE_HEADERS.test(origin.header);
}

export function isStructuredValue(origin) {
  return origin?.kind === 'header' && STRUCTURED_HEADERS.test(origin.header);
}

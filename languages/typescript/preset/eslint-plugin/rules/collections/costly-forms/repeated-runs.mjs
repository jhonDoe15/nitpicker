import { ancestorsOf } from '../../analysis/ancestry.mjs';

const WRAPPERS = new Set([
  'ChainExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
]);
const FUNCTIONS = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const ITERATION_METHODS = new Set([
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flatMap',
  'forEach',
  'map',
  'reduce',
  'reduceRight',
  'some',
  'sort',
  'toSorted',
]);
const LISTENER_METHODS = new Set([
  'addEventListener',
  'addListener',
  'on',
  'once',
  'prependListener',
  'prependOnceListener',
  'subscribe',
]);

export function unwrapped(node) {
  return WRAPPERS.has(node.type) ? unwrapped(node.expression) : node;
}

export function outerOf(node) {
  return WRAPPERS.has(node.parent?.type) ? outerOf(node.parent) : node;
}

export function contains(outer, inner) {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

export function memberName(member) {
  if (!member.computed) {
    return member.property.type === 'Identifier' ? member.property.name : undefined;
  }
  return member.property.type === 'Literal' && typeof member.property.value === 'string'
    ? member.property.value
    : undefined;
}

export function calledMember(call) {
  const callee = unwrapped(call.callee);
  return callee.type === 'MemberExpression' ? callee : undefined;
}

export function methodCallOn(node) {
  const member = outerOf(node).parent;
  if (member?.type !== 'MemberExpression' || unwrapped(member.object) !== node) {
    return undefined;
  }
  const call = outerOf(member).parent;
  return call?.type === 'CallExpression' && calledMember(call) === member
    ? { name: memberName(member), call }
    : { name: memberName(member), member };
}

function isFunction(node) {
  return FUNCTIONS.has(node.type);
}

function callbackRole(fn) {
  const call = outerOf(fn).parent;
  if (call?.type !== 'CallExpression' || !call.arguments.includes(outerOf(fn))) {
    return undefined;
  }
  const name = calledMember(call) === undefined ? undefined : memberName(calledMember(call));
  if (ITERATION_METHODS.has(name)) {
    return 'callback';
  }
  return LISTENER_METHODS.has(name) ? 'handler' : undefined;
}

function repeatsChild(loop, child) {
  switch (loop.type) {
    case 'ForOfStatement':
    case 'ForInStatement':
      return child === loop.body;
    case 'ForStatement':
      return child !== loop.init;
    case 'WhileStatement':
    case 'DoWhileStatement':
      return true;
    default:
      return false;
  }
}

function roleOf(node, child, anyFunction) {
  if (repeatsChild(node, child)) {
    return 'loop';
  }
  if (!isFunction(node)) {
    return undefined;
  }
  return callbackRole(node) ?? (anyFunction ? 'function' : undefined);
}

export function repeatedRole(node, boundary, { anyFunction = false } = {}) {
  const chain = [node, ...ancestorsOf(node)];
  const index = chain.findIndex((ancestor, position) => {
    if (position === 0 || contains(ancestor, boundary)) {
      return false;
    }
    return roleOf(ancestor, chain[position - 1], anyFunction) !== undefined;
  });
  return index === -1 ? undefined : roleOf(chain[index], chain[index - 1], anyFunction);
}

function isNameSlot(node, key) {
  return (
    (key === 'property' && node.type === 'MemberExpression' && !node.computed) ||
    (key === 'key' && node.type === 'Property' && !node.computed)
  );
}

export function someNode(node, predicate) {
  return (
    predicate(node) ||
    Object.entries(node).some(
      ([key, value]) =>
        key !== 'parent' &&
        !isNameSlot(node, key) &&
        (Array.isArray(value) ? value : [value]).some(
          (child) => typeof child?.type === 'string' && someNode(child, predicate),
        ),
    )
  );
}

export function referencesName(node, name) {
  return someNode(node, (child) => child.type === 'Identifier' && child.name === name);
}

export function returnedExpression(fn) {
  if (fn.body.type !== 'BlockStatement') {
    return fn.body;
  }
  const [only] = fn.body.body;
  return fn.body.body.length === 1 && only.type === 'ReturnStatement' ? only.argument : undefined;
}

export function singleParameter(fn) {
  const [parameter] = fn?.params ?? [];
  const isCallback =
    fn?.type === 'ArrowFunctionExpression' || fn?.type === 'FunctionExpression';
  return isCallback && parameter?.type === 'Identifier' ? parameter.name : undefined;
}

export function equalitySides(expression) {
  const body = expression === undefined || expression === null ? undefined : unwrapped(expression);
  return body?.type === 'BinaryExpression' && ['===', '=='].includes(body.operator)
    ? [body.left, body.right]
    : undefined;
}

import { depthFirst } from '../../../../../../../shared/traversal.mjs';
import { ancestorsOf, chainOf, contains } from '../../analysis/ancestry.mjs';
import { memberName } from '../../analysis/test-code-analysis.mjs';
import { unwrapped } from '../../regex/regex-bindings.mjs';

export { contains, memberName, unwrapped };

const WRAPPERS = new Set([
  'ChainExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
]);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
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

export function outerOf(node) {
  return chainOf(node, (current) =>
    WRAPPERS.has(current.parent?.type) ? current.parent : undefined,
  ).at(-1);
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

function functionName(fn) {
  if (fn.id !== null && fn.id !== undefined) {
    return fn.id.name;
  }
  const declarator = outerOf(fn).parent;
  return declarator?.type === 'VariableDeclarator' && declarator.id.type === 'Identifier'
    ? declarator.id.name
    : undefined;
}

function isRecursive(fn) {
  const name = functionName(fn);
  return name !== undefined && referencesName(fn.body, name);
}

function roleOf(node, child, recursion) {
  if (repeatsChild(node, child)) {
    return 'loop';
  }
  if (!isFunction(node)) {
    return undefined;
  }
  return callbackRole(node) ?? (recursion && isRecursive(node) ? 'recursion' : undefined);
}

export function repeatedRole(node, boundary, { recursion = false } = {}) {
  const chain = [node, ...ancestorsOf(node)];
  const index = chain.findIndex((ancestor, position) => {
    if (position === 0 || contains(ancestor, boundary)) {
      return false;
    }
    return roleOf(ancestor, chain[position - 1], recursion) !== undefined;
  });
  return index === -1 ? undefined : roleOf(chain[index], chain[index - 1], recursion);
}

function isNameSlot(node, key) {
  return (
    (key === 'property' && node.type === 'MemberExpression' && !node.computed) ||
    (key === 'key' && node.type === 'Property' && !node.computed)
  );
}

function codeChildren(node) {
  return Object.entries(node)
    .filter(([key]) => key !== 'parent' && !isNameSlot(node, key))
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((child) => typeof child?.type === 'string');
}

export function someNode(node, predicate) {
  return [...depthFirst(node, codeChildren)].some(predicate);
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
  const isCallback = fn?.type === 'ArrowFunctionExpression' || fn?.type === 'FunctionExpression';
  return isCallback && parameter?.type === 'Identifier' ? parameter.name : undefined;
}

export function equalitySides(expression) {
  const body = expression === undefined || expression === null ? undefined : unwrapped(expression);
  return body?.type === 'BinaryExpression' && ['===', '=='].includes(body.operator)
    ? [body.left, body.right]
    : undefined;
}

export function numberValue(node) {
  const value = unwrapped(node);
  const negated = value.type === 'UnaryExpression' && value.operator === '-';
  const literal = negated ? unwrapped(value.argument) : value;
  if (literal.type !== 'Literal' || typeof literal.value !== 'number') {
    return undefined;
  }
  return negated ? -literal.value : literal.value;
}

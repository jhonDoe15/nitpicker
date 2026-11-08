import {
  equalitySides,
  methodCallOn,
  outerOf,
  referencesName,
  repeatedRole,
  returnedExpression,
  singleParameter,
  unwrapped,
} from './repeated-runs.mjs';

const APPENDS = new Set(['push', 'unshift']);
const POSITIONAL = new Set([
  'at',
  'copyWithin',
  'fill',
  'findIndex',
  'findLastIndex',
  'lastIndexOf',
  'pop',
  'reverse',
  'shift',
  'sort',
  'splice',
  'toSpliced',
  'with',
]);
const ABSENT = -1;
const PRESENCE_OPERATORS = new Set(['===', '!==', '==', '!=', '<', '>=', '>', '<=']);

function isArrayLiteral(init) {
  const value = init === null ? undefined : unwrapped(init);
  if (value?.type === 'ArrayExpression') {
    return true;
  }
  return (
    value?.type === 'NewExpression' &&
    value.callee.type === 'Identifier' &&
    value.callee.name === 'Array' &&
    value.arguments.length === 0
  );
}

function numberValue(node) {
  if (node.type === 'UnaryExpression' && node.operator === '-') {
    const inner = numberValue(node.argument);
    return inner === undefined ? undefined : -inner;
  }
  return node.type === 'Literal' && typeof node.value === 'number' ? node.value : undefined;
}

function isPresenceTest(call) {
  const comparison = outerOf(call).parent;
  if (comparison?.type !== 'BinaryExpression' || !PRESENCE_OPERATORS.has(comparison.operator)) {
    return false;
  }
  const other = comparison.left === outerOf(call) ? comparison.right : comparison.left;
  return numberValue(other) === ABSENT || numberValue(other) === 0;
}

function isIdentityCallback(fn) {
  const name = singleParameter(fn);
  const sides = name === undefined ? undefined : equalitySides(returnedExpression(fn));
  if (sides === undefined) {
    return false;
  }
  const [own, other] = sides.map(unwrapped);
  return (
    (own.type === 'Identifier' && own.name === name && !referencesName(other, name)) ||
    (other.type === 'Identifier' && other.name === name && !referencesName(own, name))
  );
}

function isSpreadAppend(reference, name) {
  const assignment = reference.identifier.parent;
  if (assignment?.type !== 'AssignmentExpression' || assignment.left !== reference.identifier) {
    return false;
  }
  const value = unwrapped(assignment.right);
  return (
    value.type === 'ArrayExpression' &&
    value.elements.length > 1 &&
    value.elements.some(
      (element) =>
        element?.type === 'SpreadElement' &&
        element.argument.type === 'Identifier' &&
        element.argument.name === name,
    )
  );
}

function memberUse({ name, call, member }) {
  if (member !== undefined) {
    return member.computed && name === undefined ? 'positional' : 'neutral';
  }
  if (APPENDS.has(name)) {
    return 'append';
  }
  if (POSITIONAL.has(name)) {
    return 'positional';
  }
  if (name === 'includes' || (name === 'some' && isIdentityCallback(call.arguments[0]))) {
    return 'test';
  }
  if (name === 'indexOf') {
    return isPresenceTest(call) ? 'test' : 'positional';
  }
  return 'neutral';
}

function useOf(reference, name) {
  if (reference.isWrite()) {
    return isSpreadAppend(reference, name) ? 'append' : 'neutral';
  }
  const method = methodCallOn(reference.identifier);
  return method === undefined ? 'neutral' : memberUse(method);
}

export function arrayMembership(sourceCode, declarator) {
  if (declarator.id.type !== 'Identifier' || !isArrayLiteral(declarator.init)) {
    return undefined;
  }
  const [variable] = sourceCode.getDeclaredVariables(declarator);
  const uses = variable.references
    .filter((reference) => !reference.init)
    .map((reference) => ({ reference, use: useOf(reference, declarator.id.name) }));
  if (uses.some(({ use }) => use === 'positional') || !uses.some(({ use }) => use === 'append')) {
    return undefined;
  }
  const test = uses.find(
    ({ reference, use }) =>
      use === 'test' &&
      repeatedRole(reference.identifier, declarator.parent, { anyFunction: true }) !== undefined,
  );
  if (test === undefined) {
    return undefined;
  }
  const { name } = methodCallOn(test.reference.identifier);
  return {
    node: test.reference.identifier,
    messageId: 'arrayAsSet',
    data: { name: declarator.id.name, method: name },
  };
}
